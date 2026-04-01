export class BaseFeed {
  constructor(name) {
    this.name = name;
    this.listeners = new Set();
    this.state = {
      exchange: name,
      symbol: null,
      price: null,
      updatedAt: null,
      connected: false
    };
  }

  onUpdate(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(nextState) {
    this.state = {
      ...this.state,
      ...nextState
    };

    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}
