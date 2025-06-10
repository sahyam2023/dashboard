# hooks/hook-socketio.py - PyInstaller hook for python-socketio

from PyInstaller.utils.hooks import collect_submodules, collect_data_files

# Collect all socketio submodules
hiddenimports = collect_submodules('socketio')

# Collect data files
datas = collect_data_files('socketio')

# Add specific socketio modules
hiddenimports += [
    'socketio.server',
    'socketio.client',
    'socketio.namespace',
    'socketio.middleware',
    'socketio.packet',
    'socketio.pubsub_manager',
    'socketio.kombu_manager',
    'socketio.redis_manager',
    'socketio.asyncio_manager',
    'socketio.asyncio_client',
    'socketio.asyncio_namespace',
    'socketio.asyncio_server'
]