#!/usr/bin/env node

const defaults = require('./src/defaults')
const figmaApiBase = 'https://api.figma.com/v1'
const Fs = require('fs')
const Path = require('path')
const ora = require('ora')
const chalk = require('chalk')
const Axios = require('axios')
const prompts = require('prompts')
const promptsList = require('./src/prompts')
const mkdirp = require('mkdirp')
let config = {}

function deleteConfig () {
  const configFile = Path.resolve(defaults.configFileName)
  if (Fs.existsSync(configFile)) {
    Fs.unlinkSync(configFile)
    console.log(chalk.cyan.bold('Deleted previous config'))
  }
}

function updateGitIgnore () {
  const ignorePath = '.gitignore'
  const ignoreCompletePath = Path.resolve(ignorePath)
  const ignoreContent = '\n#figma-export-icons\nicons-config.json'
  const ignore = Fs.existsSync(ignoreCompletePath)
    ? Fs.readFileSync(ignoreCompletePath, 'utf-8')
    : ''
  if(!ignore.includes(ignoreContent)) {
    Fs.writeFileSync(ignoreCompletePath, ignore + ignoreContent)
    console.log(`Updated ${ignorePath} : ${ignoreContent}`)
  }
}

function getConfig () {
  return new Promise((resolve) => {
    const configFile = Path.resolve(defaults.configFileName)
    if (Fs.existsSync(configFile)) {
      config = JSON.parse(Fs.readFileSync(configFile, 'utf-8'))
      const missingConfig = promptsList.filter((q) => !config[q.name])
      if (missingConfig.length > 0) getPromptData(missingConfig).then(() => resolve())
      else resolve()
    } else {
      getPromptData().then(() => resolve())
    }
  })
}

async function getPromptData ( list = promptsList ) {
  const onCancel = prompt => {
    process.exit(1)
  }
  const response = await prompts(list, { onCancel })
  config = Object.assign(config, response)
  Fs.writeFileSync('icons-config.json', JSON.stringify(config, null, 2))
}

Axios.interceptors.request.use((conf) => {
  conf.headers = {
    'Content-Type': 'application/json',
    'X-Figma-Token': config.figmaPersonalToken
  }
  conf.startTime = new Date().getTime()
  return conf
})
const spinner = ora()

function deleteIcons () {
  const directory = Path.resolve(config.iconsPath)
  if (!Fs.existsSync(directory)){
    console.log(`Directory ${config.iconsPath} does not exist`)
    if (mkdirp.sync(directory)) console.log(`Created directory ${config.iconsPath}`)
  } else {
    Fs.readdir(directory, (err, files) => {
      if (err) throw err
      spinner.start('Deleting directory contents')
      files.forEach((file) => {
        if (file !== 'README.md') {
          Fs.unlinkSync(Path.join(directory, file))
        }
      })
      spinner.succeed()
    })
  }
}

function findDuplicates (propertyName, arr) {
  return arr.reduce((acc, current) => {
    const x = acc.find(item => item[propertyName] === current[propertyName])
    if (x) {
      spinner.fail(chalk.bgRed.bold(`Duplicate icon name: ${x[propertyName]}. Please fix figma file`))
      current[propertyName] = current[propertyName] + '-duplicate-name'
    }
    return acc.concat([current])
  }, [])
}

function getFigmaFile () {
  return new Promise((resolve) => {
    spinner.start('Fetching Figma file (this might take a while depending on the figma file size)')
    Axios.get(`${figmaApiBase}/files/${config.fileId}`)
      .then((res) => {
        const endTime = new Date().getTime()
        spinner.succeed()
        console.log(chalk.cyan.bold(`Finished in ${(endTime - res.config.startTime) / 1000}s`))
        const page = res.data.document.children.find(c => c.name === config.page)
        if (!page) {
          console.log(chalk.red.bold('Cannot find Icons Page, check your settings'))
          return
        }
        if (!page.children.find(c => c.name === config.frame)) {
          console.log(chalk.red.bold('Cannot find Icons Frame in this Page, check your settings'))
          return
        }
        let icons = page.children.find(c => c.name === config.frame).children.map((icon) => {
          return {id: icon.id, name: icon.name}
        })
        icons = findDuplicates('name', icons)
        resolve(icons)
      })
      .catch((err) => {
        spinner.fail()
        if (err.response) {
          console.log(chalk.red.bold(`Cannot get Figma file: ${err.response.data.status} ${err.response.data.err}`))
        } else {
          console.log(err)
        }
        process.exit(1)
      })
  })
}

function getImages (icons) {
  return new Promise((resolve) => {
    spinner.start('Fetching icon urls')
    const iconIds = icons.map(icon => icon.id).join(',')
    Axios.get(`${figmaApiBase}/images/${config.fileId}?ids=${iconIds}&format=svg`)
      .then((res) => {
        spinner.succeed()
        const images = res.data.images
        icons.forEach((icon) => {
          icon.image = images[icon.id]
        })
        resolve(icons)
      })
      .catch((err) => {
        console.log('Cannot get icons: ', err)
        process.exit(1)
      })
  })
}

function downloadImage (url, name) {
  const path = Path.resolve(config.iconsPath, `${name}.svg`)
  const writer = Fs.createWriteStream(path)


  Axios.get(url, {responseType: 'stream'})
    .then((res) => {
      res.data.pipe(writer)
    })
    .catch((err) => {
      console.log(name, err.message)
      console.log(err.config.url)
    })

  return new Promise((resolve, reject) => {
    writer.on('finish', () => {
      // console.log(`Saved ${name}.svg`)
      resolve()
    })
    writer.on('error', (err) => {
      console.log('error writting', err)
      reject(err)
    })
  })

}

function figmaExportIcons () {
  getFigmaFile()
    .then((res) => {
      getImages(res)
        .then((icons) => {
          deleteIcons()
          console.log(`Api returned ${icons.length} icons`)
          spinner.start('Downloading')
          const AllIcons = icons.map(icon => downloadImage(icon.image, icon.name))
          Promise.all(AllIcons).then(() => {
            spinner.succeed(chalk.cyan.bold('Download Finished!'))
          })
        })
        .catch((err) => {
          console.log(chalk.red(err))
        })
  })
}

function exportIcons () {
  updateGitIgnore()
  if (process.argv[2] && process.argv[2] === '-c') {
    deleteConfig()
  }
  getConfig().then(() => figmaExportIcons())
}

exportIcons()
