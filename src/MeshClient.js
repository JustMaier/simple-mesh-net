import { WrappedWebSocket, raceToSuccess, allSuccesses } from './utility';
import LiteEventEmitter from 'lite-ee';
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

		const signalSocket = new WrappedWebSocket(this.options.signalServer)
			.on('open', () => signalSocket.send('discover', { peerName: this.peerName }))
			.on('discovered', ({ peerName }) => {
				this.options.logger('discovered', peerName);
				this.peers[peerName] = new MeshPeer(this, peerName, { isInitiator: true });
			})
			.on('signal', ({ peerName, signal }) => {
				this.options.logger('signal from', peerName, signal);
				const peer = this.peers[peerName] = this.peers[peerName] || new MeshPeer(this, peerName);

				peer._peer.signal(signal);
			})
			.on('data', ({peerName, id, type, payload}) => {
				const peer = this.peers[peerName];

				peer._peer.emit('data', {id, type, payload});
			})
			.on('disconnected', ({peerName}) => {
				const peer = this.peers[peerName];

				peer._peer.emit('socket:disconnect');
			});

		this._peerEvents = {
			error: (peer, err) => this.emit(MeshClientEvents.PEER_ERROR, peer, err),
			close: (peer) => {
				if (this.peers[peer.peerName]._peer.isDestroyed()) delete this.peers[peer.peerName];
				this.emit(MeshClientEvents.PEER_CLOSE, peer);
			},
			connect: (peer) => this.emit(MeshClientEvents.PEER_CONNECT, peer),
			data: (peer, type, req, res) => this.emit(type, peer, req, res),
			signal: (peer, signal) => {
				signalSocket.send('signal', { peerName: peer.peerName, signal });
				this.emit(MeshClientEvents.PEER_SIGNAL, peer, signal);
			},
			send: (peer, data) => {
				signalSocket.send('data', {peerName: peer.peerName, ...data});
			}
		};

		// PubSub
		this.subscriptions = [];
		this.on('subscribe', (peer, { payload: { topic } }, res) => {
			if (!peer.subscriptions.includes(topic)) peer.subscriptions.push(topic);
			res.send(this.subscriptions.includes(topic));
		});
		this.on('unsubscribe', (peer, { payload: { topic } }, res) => {
			const index = peer.subscriptions.indexOf(topic);

			if (index !== -1) peer.subscriptions.splice(index, 1);
			res.send(this.subscriptions.includes(topic));
		});
	}

	send(peerName, type, data, timeout = undefined) {
		return this.peers[peerName].send(type, data, timeout);
	}
	broadcast(type, data, filterFn = null, timeout = undefined) {
		const promises = Object.values(this.peers)
			.filter(x => x._peer.isConnected())
			.filter(x => filterFn == null || filterFn(x))
			.map(peer => peer.send(type, data, timeout));

		if (promises.length === 0) return Promise.reject('No peers');
		return raceToSuccess(promises);
	}

	subscribe(topic, data = {}) {
		this.subscriptions.push(topic);
		const promises = Object.values(this.peers)
			.filter(x => x._peer.isConnected())
			.map(peer => new Promise(async (resolve, reject) => {
				try {
					const isSubscribed = await peer.send('subscribe', { topic, ...data });
					const subscriptionIndex = peer.subscriptions.indexOf(topic);

					if (isSubscribed && subscriptionIndex === -1) peer.subscriptions.push(topic);
					else if (!isSubscribed && subscriptionIndex !== -1) peer.subscriptions.splice(subscriptionIndex, 1);

					resolve(isSubscribed);
				} catch {
					reject('Timeout');
				}
			}));

		return allSuccesses(promises);
	}
	unsubscribe(topic, data = {}) {
		const subscriptionIndex = this.subscriptions.indexOf(topic);

		if (subscriptionIndex !== -1) this.subscriptions.splice(subscriptionIndex, 1);

		return this.broadcast('unsubscribe', { topic, ...data });
	}
	publish(topic, type, data, timeout = undefined) {
		return this.broadcast(type, data, x => x.subscriptions.includes(topic), timeout);
	}
}
