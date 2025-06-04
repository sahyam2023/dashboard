# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(['app.py'],
             pathex=['.'],
             binaries=[],
             datas=[
                 ('frontend/dist', 'frontend/dist'), # Bundled UI, accessed via _MEIPASS
                 ('schema.sql', '.'),                # Bundled schema for DB init, accessed via _MEIPASS
                 ('migrations', 'migrations'),        # Bundled migrations, accessed via _MEIPASS
                 ('instance/default_profile_pictures', 'instance/default_profile_pictures')
                                                     # instance/default_profile_pictures is NOT bundled here.
                                                     # NSIS will copy them to the install dir.
             ],
             hiddenimports=[
                'waitress',
                'flask_cors',
                'flask_bcrypt',
                'flask_jwt_extended',
                'werkzeug',
                'apscheduler',
                'pytz',
                'sqlite3',
                'babel', # Often a hidden import for Flask/Jinja if locales are used
                'jinja2.ext', # Sometimes needed
                # Add other potential hidden imports based on your full dependency tree.
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
          name='app',
          debug=False,
          bootloader_ignore_signals=False,
          strip=False,
          upx=True,
          console=False, # No console window for the service
          onefile=True,  # Single file executable
          icon=r'C:\Users\i2v\Documents\GitHub\dashboard\dashboard.ico')     # User can specify an icon path here, e.g., 'your_icon.ico'

          