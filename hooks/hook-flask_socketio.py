# hooks/hook-flask_socketio.py - PyInstaller hook for Flask-SocketIO

from PyInstaller.utils.hooks import collect_submodules, collect_data_files

# Collect all Flask-SocketIO submodules
hiddenimports = collect_submodules('flask_socketio')

# Collect data files
datas = collect_data_files('flask_socketio')

# Add specific Flask-SocketIO modules
hiddenimports += [
    'flask_socketio',
    'flask_socketio.namespace',
    'flask_socketio.test_client'
]