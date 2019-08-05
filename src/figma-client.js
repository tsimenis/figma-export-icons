const axios = require('axios')
const figmaApiBase = 'https://api.figma.com/v1'

const Client = (token) => {

  const instance = axios.create({
    baseURL: figmaApiBase
  })

  instance.interceptors.request.use((conf) => {
    conf.headers = {
      'Content-Type': 'application/json',
      'X-Figma-Token': token
    }
    conf.startTime = new Date().getTime()
    return conf
  })

  return instance

}

module.exports = Client
