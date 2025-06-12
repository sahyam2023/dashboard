# main.spec - Updated for better Flask-SocketIO support

import sys
sys.setrecursionlimit(5000)

block_cipher = None

a = Analysis(['app.py'],
             pathex=['.'],
             binaries=[],
             datas=[
                 ('frontend/dist', 'frontend/dist'),
                 ('instance/default_profile_pictures', 'default_profile_pictures_bundle_location'),
                 ('schema.sql', '.')
             ],
             hiddenimports=[
                 # Core dependencies
                 'dns',
                 'dns.resolver',
                 'dns.rdatatype', 
                 'dns.rdataclass',
                 'apscheduler',
                 'apscheduler.schedulers.background',
                 'flask_bcrypt',
                 'flask_jwt_extended',
                 'flask_cors',
                 'sqlite3',
                 'pytz',
                 'jinja2',
                 
                 # Cryptography dependencies
                 'cryptography',
                 'cryptography.fernet',
                 'cryptography.hazmat',
                 'cryptography.hazmat.primitives',
                 'cryptography.hazmat.backends',
                 'cryptography.hazmat.backends.openssl',
                 
                 # Flask-APScheduler dependencies
                 'flask_apscheduler',
                 'apscheduler.schedulers.base',
                 'apscheduler.schedulers.blocking',
                 'apscheduler.executors',
                 'apscheduler.executors.base',
                 'apscheduler.executors.pool',
                 'apscheduler.jobstores',
                 'apscheduler.jobstores.base',
                 'apscheduler.jobstores.memory',
                 'apscheduler.triggers',
                 'apscheduler.triggers.base',
                 'apscheduler.triggers.date',
                 'apscheduler.triggers.interval',
                 'apscheduler.triggers.cron',
                 
                 # Eventlet and SocketIO dependencies
                 'eventlet',
                 'eventlet.wsgi',
                 'eventlet.green',
                 'eventlet.green.threading',
                 'eventlet.green.socket',
                 'eventlet.green.ssl',
                 'eventlet.green.select',
                 'eventlet.green.time',
                 'eventlet.hubs',
                 'eventlet.hubs.epolls',
                 'eventlet.hubs.hub',
                 'eventlet.hubs.selects',
                 
                 # Flask-SocketIO dependencies
                 'flask_socketio',
                 'socketio',
                 'socketio.server',
                 'socketio.client',
                 'engineio',
                 'engineio.server',
                 'engineio.client',
                 
                 # Additional async dependencies
                 'greenlet',
                 'monotonic',
                 'six'
             ],
             hookspath=['hooks'],
             runtime_hooks=['rthook_eventlet.py'],
             excludes=[
                 'tkinter',
                 'matplotlib',
                 'numpy',
                 'pandas'
             ],
             win_no_prefer_redirects=False,
             win_private_assemblies=False,
             cipher=block_cipher,
             noarchive=False)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(pyz,
          a.scripts,
          a.binaries,
          a.zipfiles,
          a.datas,
          [],
          name='SoftwareDashboardApp',
          debug=False,
          bootloader_ignore_signals=False,
          strip=False,
          upx=True,
          upx_exclude=[],
          runtime_tmpdir=None,
          console=False,
          onefile=True)