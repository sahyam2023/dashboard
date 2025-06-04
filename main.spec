# main.spec
# -*- mode: python ; coding: utf-8 -*-

import sys
sys.setrecursionlimit(5000) # Recommended for Flask apps sometimes

block_cipher = None

a = Analysis(['app.py'], # Main application script
             pathex=['.'], # Add current directory to import paths
             binaries=[],
             datas=[
                 ('frontend/dist', 'frontend/dist'),
                 ('instance/default_profile_pictures', 'default_profile_pictures_bundle_location'),
                 ('schema.sql', '.') # Bundle schema.sql at the root of the bundle
             ],
             hiddenimports=[
                 'waitress',
                 'apscheduler', # Keep this general, specific schedulers might be found
                 'apscheduler.schedulers.background',
                 'flask_bcrypt',
                 'flask_jwt_extended',
                 'flask_cors',
                 'sqlite3',
                 'pytz', # Added as it's used for timezone
                 'jinja2' # Often a Flask dependency that might need to be explicit
             ],
             hookspath=[],
             runtime_hooks=[],
             excludes=[],
             win_no_prefer_redirects=False,
             win_private_assemblies=False,
             cipher=block_cipher,
             noarchive=False)
pyz = PYZ(a.pure, a.zipped_data,
             cipher=block_cipher)
exe = EXE(pyz,
          a.scripts,
          a.binaries,
          a.zipfiles,
          a.datas,
          [],
          name='SoftwareDashboardApp', # Replace with the desired app name
          debug=False,
          bootloader_ignore_signals=False,
          strip=False,
          upx=True, # Compresses the executable
          upx_exclude=[],
          runtime_tmpdir=None,
          console=True, # True for web servers to see logs
          onefile=True) # Create a one-file bundled executable
