# hooks/hook-engineio.py - PyInstaller hook for python-engineio

from PyInstaller.utils.hooks import collect_submodules, collect_data_files

# Collect all engineio submodules
hiddenimports = collect_submodules('engineio')

# Collect data files
datas = collect_data_files('engineio')

# Add specific engineio modules
hiddenimports += [
    'engineio.server',
    'engineio.client',
    'engineio.socket',
    'engineio.packet',
    'engineio.payload',
    'engineio.base_server',
    'engineio.base_client',
    'engineio.base_socket',
    'engineio.asyncio_server',
    'engineio.asyncio_client',
    'engineio.asyncio_socket'
]