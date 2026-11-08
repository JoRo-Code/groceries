#!/usr/bin/env python3
"""Keep SystemCapabilities a PBX dictionary on XcodeGen 2.46.

Upstream: https://github.com/yonaskolb/XcodeGen/issues/1637
Newer generators that already emit the correct dictionary need no rewrite.
"""
import json
from pathlib import Path
import re
import subprocess

project = Path(__file__).resolve().parents[1] / 'Handla.xcodeproj/project.pbxproj'
source = project.read_text()
pattern = r'SystemCapabilities = "(?:\\.|[^"\\])*";'
replacement = '''SystemCapabilities = {
                            com.apple.SignInWithApple = { enabled = 1; };
                            com.apple.AssociatedDomains = { enabled = 1; };
                        };'''
updated, count = re.subn(pattern, replacement, source)
if count > 1:
    raise SystemExit('Unexpected multiple SystemCapabilities strings; inspect project before changing it.')
if count:
    project.write_text(updated)
data = json.loads(subprocess.check_output(['plutil', '-convert', 'json', '-o', '-', str(project)]))
objects = data['objects']
app_id = next(key for key, value in objects.items() if value.get('isa') == 'PBXNativeTarget' and value.get('name') == 'Handla')
capabilities = objects[data['rootObject']]['attributes']['TargetAttributes'][app_id]['SystemCapabilities']
assert isinstance(capabilities, dict), 'SystemCapabilities must be a PBX dictionary'
for capability in ['com.apple.SignInWithApple', 'com.apple.AssociatedDomains']:
    assert str(capabilities[capability]['enabled']) == '1', f'{capability} must be enabled'
print('Validated native Apple sign-in and Associated Domains capabilities.')
