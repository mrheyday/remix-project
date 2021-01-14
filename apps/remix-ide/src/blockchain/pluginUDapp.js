class PluginUdapp {
  constructor (blockchain) {
    this.blockchain = blockchain
  }

  createVMAccount (newAccount) {
    return this.blockchain.createVMAccount(newAccount)
  }

  sendTransaction (tx) {
    return this.blockchain.sendTransaction(tx)
  }

  getAccounts (cb) {
    return this.blockchain.getAccounts(cb)
  }

  pendingTransactionsCount () {
    return this.blockchain.pendingTransactionsCount()
  }
}

module.exports = PluginUdapp
