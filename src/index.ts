import * as http from 'http';
import * as debug from 'debug';

import App from './App';
import Logger from './Logger';

const log = Logger('server');

debug('ts-express:server');

const port = normalizePort(process.env.PORT || 3000);
App.set('port', port);

const server = http.createServer(App);
server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

function normalizePort(val: number|string): number|string|boolean {
    const portNo: number = (typeof val === 'string') ? parseInt(val, 10) : val;
    if (isNaN(portNo)) {
        return val;
    } else if (portNo >= 0) {
        return portNo;
    } else {
        return false;
    }
}

function onError(error: NodeJS.ErrnoException): void {
    if (error.syscall !== 'listen') {
        throw error;
    }
    const bind = (typeof port === 'string') ? 'Pipe ' + port : 'Port ' + port;
    switch (error.code) {
        case 'EACCES':
            log.error(`${bind} requires elevated privileges`);
            process.exit(1);
            break;
        case 'EADDRINUSE':
            log.error(`${bind} is already in use`);
            process.exit(1);
            break;
        default:
            throw error;
    }
}

function onListening(): void {
  const addr = server.address();
  const bind = (typeof addr === 'string') ? `pipe ${addr}` : `port ${addr.port}`;
  log.info(`Listening on ${bind}`);
}
