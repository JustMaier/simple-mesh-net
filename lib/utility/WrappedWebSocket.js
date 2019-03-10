import LiteEventEmitter from 'lite-ee';
export default class WrappedWebSocket extends LiteEventEmitter {
  constructor(endpoint) {
    super();
    const socket = new WebSocket(endpoint);

    socket.onmessage = ({
      data
    }) => {
      const {
        type,
        payload
      } = JSON.parse(data);
      this.emit(type, payload);
    };

    socket.onopen = () => this.emit('open', this);

    this.send = (type, payload) => socket.send(JSON.stringify({
      type,
      payload
    }));
  }

}