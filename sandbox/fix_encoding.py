import sys

f = r"c:\Users\yu007637\OneDrive - Yunex\Documents\Software Development\VROOM Engine\New VROOM Development\sandbox\frontend\app.js"
with open(f, 'rb') as fh:
    data = fh.read()

replacements = {
    b'\xc3\xa2\xe2\x80\x93\xc2\xb6': b'\xe2\x96\xb6',  # play
    b'\xc3\xa2\xe2\x80\xa0\xc2\xbb': b'\xe2\x86\xbb',  # replay
    b'\xc3\xa2\xe2\x80\x94\xc2\x8f': b'\xe2\x8c\x9a',  # watch
    b'\xc3\xa2\xe2\x80\xa0\xe2\x80\x99': b'\xe2\x8c\x9b',  # hourglass
    b'\xc3\xa2\xe2\x82\xac\xc2\xa2': b'\xe2\x80\xa2',  # bullet
    b'\xc3\xa2\xc2\x8f\xc2\xb8': b'\xe2\x8f\xb8',  # pause
    b'\xc3\xa2\xe2\x80\x9d\xe2\x82\xac': b'\xe2\x95\x90',  # box drawing horizontal ═
}

for k, v in replacements.items():
    data = data.replace(k, v)

# Re-scan
remaining = data.count(b'\xc3\xa2')
print(f"Remaining c3 a2: {remaining}")

with open(f, 'wb') as fh:
    fh.write(data)
