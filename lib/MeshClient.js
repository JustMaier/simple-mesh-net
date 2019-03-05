import { WrappedWebSocket, raceToSuccess } from './utility';
import LiteEventEmitter from 'lite-event-emitter';
import MeshPeer from './MeshPeer';
export const MeshClientEvents = {
  PEER_CLOSE: 'peer:close',
  PEER_ERROR: 'peer:error',
  PEER_CONNECT: 'peer:connect',
  PEER_SIGNAL: 'peer:signal'
};
export default class MeshClient extends LiteEventEmitter {
  constructor(peerName, options = {}) {
    super();
    this.peerName = peerName;
    this.options = {
      signalServer: 'ws://localhost:8080',
      logger: (...args) => console.log(...args),
      ...options
    };
    this.peers = {};
    const signalSocket = new WrappedWebSocket(this.options.signalServer).on('discovered', ({
      peerName
    }) => {
      this.options.logger('discovered', peerName);
      this.peers[peerName] = new MeshPeer(this, peerName, {
        isInitiator: true
      });
    }).on('signal', ({
      peerName,
      signal
    }) => {
      this.options.logger('signal from', peerName);
      const peer = this.peers[peerName] = this.peers[peerName] || new MeshPeer(this, peerName);

      peer._peer.signal(signal);
    }).on('open', () => signalSocket.send('discover', {
      peerName: this.peerName
    }));
    this._peerEvents = {
      error: (peer, err) => this.emit(MeshClientEvents.PEER_ERROR, peer, err),
      close: peer => {
        if (this.peers[peer.peerName]._peer.isDestroyed()) delete this.peers[peer.peerName];
        this.emit(MeshClientEvents.PEER_CLOSE, peer);
      },
      connect: peer => this.emit(MeshClientEvents.PEER_CONNECT, peer),
      data: (peer, type, req, res) => this.emit(type, peer, req, res),
      signal: (peer, signal) => {
        signalSocket.send('signal', {
          peerName: peer.peerName,
          signal
        });
        this.emit(MeshClientEvents.PEER_SIGNAL, peer, signal);
      }
    };
  }

  send(peerName, type, data) {
    return this.peers[peerName].send(type, data);
  }

  broadcast(type, data, filterFn = null) {
    const promises = Object.values(this.peers).filter(x => x._peer.isConnected()).filter(x => filterFn == null || filterFn(x)).map(peer => peer.send(type, data));
    return raceToSuccess(promises);
  }

}