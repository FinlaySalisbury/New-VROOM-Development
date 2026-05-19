import sys, re

filepath = 'c:/Users/yu007637/OneDrive - Yunex/Documents/Software Development/VROOM Engine/New VROOM Development/sandbox/frontend/app.js'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

sm_old = """const StorageManager = {
    getEngineers()     { return JSON.parse(localStorage.getItem('vroom_engineers') || '[]'); },
    saveEngineers(arr) { localStorage.setItem('vroom_engineers', JSON.stringify(arr)); },
    getJobLists()      { return JSON.parse(localStorage.getItem('vroom_job_lists') || '[]'); },
    saveJobLists(arr)  { localStorage.setItem('vroom_job_lists', JSON.stringify(arr)); },
    getDepot()         { return JSON.parse(localStorage.getItem('vroom_main_depot') || '[-0.1278, 51.5074]'); },
    saveDepot(lon, lat) { localStorage.setItem('vroom_main_depot', JSON.stringify([lon, lat])); }
};"""

sm_new = """const StorageManager = {
    async getEngineers() {
        try {
            const resp = await fetch(API_BASE + '/config/engineers');
            return await resp.json();
        } catch(e) { return []; }
    },
    async saveEngineers(arr) {
        await fetch(API_BASE + '/config/engineers', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(arr)
        });
    },
    async getJobLists() {
        try {
            const resp = await fetch(API_BASE + '/config/job-lists');
            return await resp.json();
        } catch(e) { return []; }
    },
    async saveJobLists(arr) {
        await fetch(API_BASE + '/config/job-lists', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(arr)
        });
    },
    async getDepot() {
        try {
            const resp = await fetch(API_BASE + '/config/settings/depot');
            return await resp.json();
        } catch(e) { return [-0.1278, 51.5074]; }
    },
    async saveDepot(lon, lat) {
        await fetch(API_BASE + '/config/settings/depot', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify([lon, lat])
        });
    },
    async migrateFromLocalStorage() {
        if (localStorage.getItem('vroom_engineers')) {
            await this.saveEngineers(JSON.parse(localStorage.getItem('vroom_engineers')));
            localStorage.removeItem('vroom_engineers');
        }
        if (localStorage.getItem('vroom_job_lists')) {
            await this.saveJobLists(JSON.parse(localStorage.getItem('vroom_job_lists')));
            localStorage.removeItem('vroom_job_lists');
        }
        if (localStorage.getItem('vroom_main_depot')) {
            const depot = JSON.parse(localStorage.getItem('vroom_main_depot'));
            await this.saveDepot(depot[0], depot[1]);
            localStorage.removeItem('vroom_main_depot');
        }
    }
};"""
content = content.replace(sm_old, sm_new)

funcs_to_async = [
    'function renderEngineerList()',
    'function saveEngineer()',
    'function editEngineer(id)',
    'function deleteEngineer(id)',
    'function renderJobLists()',
    'function deleteJobList(id)',
    'function renderOptimisePanel()',
    'function renderOptimiseMatrix()',
    'function aiReviewAcceptAll()',
]
for func in funcs_to_async:
    content = content.replace(func, 'async ' + func)

content = content.replace('StorageManager.', 'await StorageManager.')
content = content.replace('await await StorageManager.', 'await StorageManager.')

content = content.replace("document.addEventListener('DOMContentLoaded', () => {", "document.addEventListener('DOMContentLoaded', async () => {\n    await StorageManager.migrateFromLocalStorage();")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print('Rewrite complete.')
