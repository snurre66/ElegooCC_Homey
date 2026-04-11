import sys

path = r'c:\Users\thoma\.gemini\antigravity\scratch\elegoo-homey\drivers\elegoo_cc\driver.compose.json'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Truncate at line 392 (index 391)
# Line 392 should be "  },"
# Let's verify our list
if 'images' in lines[389]: # Just a sanity check
    clean_lines = lines[:392]
    clean_lines.append('  "pair": [\n')
    clean_lines.append('    {\n')
    clean_lines.append('      "id": "add_printer",\n')
    clean_lines.append('      "options": {\n')
    clean_lines.append('        "title": {\n')
    clean_lines.append('          "en": "Add Elegoo Printer",\n')
    clean_lines.append('          "nl": "Elegoo printer toevoegen",\n')
    clean_lines.append('          "de": "Elegoo-Drucker hinzufügen",\n')
    clean_lines.append('          "no": "Legg til Elegoo-skriver"\n')
    clean_lines.append('        }\n')
    clean_lines.append('      }\n')
    clean_lines.append('    }\n')
    clean_lines.append('  ]\n')
    clean_lines.append('}\n')
    
    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(clean_lines)
    print("Success")
else:
    print(f"Error: line 390 was {lines[389]}")
