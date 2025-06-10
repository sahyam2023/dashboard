# hooks/hook-eventlet.py - Enhanced PyInstaller hook for eventlet

from PyInstaller.utils.hooks import collect_submodules, collect_data_files

# Collect all eventlet submodules
hiddenimports = collect_submodules('eventlet')

# Collect eventlet data files
datas = collect_data_files('eventlet')

# Add specific modules that are often missed but critical for Flask-SocketIO
hiddenimports += [
    # Core eventlet green modules
    'eventlet.green.threading',
    'eventlet.green.socket',
    'eventlet.green.ssl',
    'eventlet.green.select',
    'eventlet.green.time',
    'eventlet.green.subprocess',
    'eventlet.green.os',
    'eventlet.green.httplib',
    
    # Eventlet hubs (critical for async_mode detection)
    'eventlet.hubs',
    'eventlet.hubs.epolls',
    'eventlet.hubs.selects', 
    'eventlet.hubs.hub',
    'eventlet.hubs.kqueue',
    'eventlet.hubs.poll',
    
    # WSGI and server components
    'eventlet.wsgi',
    'eventlet.websocket',
    'eventlet.semaphore',
    'eventlet.queue',
    'eventlet.pools',
    'eventlet.timeout',
    
    # Support modules
    'eventlet.support',
    'eventlet.support.greendns',
    'eventlet.convenience',
    'eventlet.corolocal',
    'eventlet.event',
    'eventlet.greenthread',
    'eventlet.greenpool'
]