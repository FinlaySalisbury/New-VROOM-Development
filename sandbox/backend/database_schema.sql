-- ========================================================================================
-- VROOM SIMULATION SANDBOX — MULTI-TENANT DATABASE SCHEMA & RLS
-- ========================================================================================

-- 1. Create Tables
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) NOT NULL DEFAULT auth.uid()
);

CREATE TABLE project_members (
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'user', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id)
);

CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'user', 'viewer')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    invited_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, email)
);

CREATE TABLE engineers (
    id TEXT NOT NULL,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, project_id)
);

CREATE TABLE sites (
    id TEXT NOT NULL,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, project_id)
);

CREATE TABLE job_lists (
    id TEXT NOT NULL,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, project_id)
);

CREATE TABLE global_settings (
    key TEXT NOT NULL,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    value TEXT NOT NULL,
    PRIMARY KEY (key, project_id)
);

CREATE TABLE test_runs (
    id TEXT PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    test_number INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    name TEXT,
    strategy TEXT NOT NULL,
    num_engineers INTEGER NOT NULL,
    num_jobs INTEGER NOT NULL,
    scenario_state JSONB NOT NULL,
    vroom_solution JSONB,
    routes_data JSONB,
    trips_geojson JSONB,
    faults_geojson JSONB,
    routes_geojson JSONB,
    combined_geojson JSONB,
    total_duration_s INTEGER,
    total_distance_m INTEGER,
    unassigned_jobs INTEGER,
    api_cost_estimate REAL,
    is_remix BOOLEAN DEFAULT false,
    parent_run_id TEXT
);

-- 2. Create Helper Functions
CREATE OR REPLACE FUNCTION get_user_role(target_project_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM project_members 
  WHERE project_id = target_project_id AND user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- 3. Triggers
-- Automatically assign the creator as the 'owner' of the project
CREATE OR REPLACE FUNCTION on_project_created()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO project_members (project_id, user_id, role)
    VALUES (NEW.id, NEW.created_by, 'owner');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_project_created
AFTER INSERT ON projects
FOR EACH ROW EXECUTE FUNCTION on_project_created();

-- 4. Invitation RPC (Bypasses RLS to allow users to insert themselves if email matches)
CREATE OR REPLACE FUNCTION accept_invitation(invite_id UUID)
RETURNS VOID AS $$
DECLARE
    inv_record RECORD;
BEGIN
    SELECT * INTO inv_record FROM invitations WHERE id = invite_id AND status = 'pending';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation not found or already processed.';
    END IF;

    -- Validate email matches auth.users email
    IF (SELECT email FROM auth.users WHERE id = auth.uid()) != inv_record.email THEN
        RAISE EXCEPTION 'Unauthorized to accept this invitation.';
    END IF;

    -- Add to project
    INSERT INTO project_members (project_id, user_id, role)
    VALUES (inv_record.project_id, auth.uid(), inv_record.role)
    ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role;

    -- Close invitation
    UPDATE invitations SET status = 'accepted' WHERE id = invite_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Enable Row Level Security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_runs ENABLE ROW LEVEL SECURITY;

-- 6. Apply RLS Policies

-- Projects
CREATE POLICY "View joined projects" ON projects FOR SELECT USING (get_user_role(id) IS NOT NULL OR auth.uid() = created_by);
CREATE POLICY "Create projects" ON projects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Update projects" ON projects FOR UPDATE USING (get_user_role(id) = 'owner');

-- Project Members
CREATE POLICY "View project members" ON project_members FOR SELECT USING (get_user_role(project_id) IS NOT NULL);
CREATE POLICY "Manage project members" ON project_members FOR ALL USING (get_user_role(project_id) = 'owner');

-- Invitations
CREATE POLICY "Owners manage invitations" ON invitations FOR ALL USING (get_user_role(project_id) = 'owner');
CREATE POLICY "Users view own invitations" ON invitations FOR SELECT USING (email = auth.jwt() ->> 'email');

-- Engineers & Sites (Admin+ manages)
CREATE POLICY "View engineers" ON engineers FOR SELECT USING (get_user_role(project_id) IS NOT NULL);
CREATE POLICY "Manage engineers" ON engineers FOR ALL USING (get_user_role(project_id) IN ('owner', 'admin'));

CREATE POLICY "View sites" ON sites FOR SELECT USING (get_user_role(project_id) IS NOT NULL);
CREATE POLICY "Manage sites" ON sites FOR ALL USING (get_user_role(project_id) IN ('owner', 'admin'));

-- Jobs & Test Runs (User+ manages)
CREATE POLICY "View job_lists" ON job_lists FOR SELECT USING (get_user_role(project_id) IS NOT NULL);
CREATE POLICY "Manage job_lists" ON job_lists FOR ALL USING (get_user_role(project_id) IN ('owner', 'admin', 'user'));

CREATE POLICY "View test_runs" ON test_runs FOR SELECT USING (get_user_role(project_id) IS NOT NULL);
CREATE POLICY "Manage test_runs" ON test_runs FOR ALL USING (get_user_role(project_id) IN ('owner', 'admin', 'user'));

-- Global Settings
CREATE POLICY "View settings" ON global_settings FOR SELECT USING (get_user_role(project_id) IS NOT NULL);
CREATE POLICY "Manage settings" ON global_settings FOR ALL USING (get_user_role(project_id) IN ('owner', 'admin'));
