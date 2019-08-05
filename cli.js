#!/usr/bin/env node

const defaults = require('./src/defaults')
const figma = require('./src/figma-client')
const fs = require('fs')
const path = require('path')
const ora = require('ora')
const chalk = require('chalk')
const ui = require('cliui')({ width: 80 })
const axios = require('axios')
const prompts = require('prompts')
const promptsList = require('./src/prompts')
const mkdirp = require('mkdirp')
let config = {}
let figmaClient
const spinner = ora()

function deleteConfig () {
  const configFile = path.resolve(defaults.configFileName)
  if (fs.existsSync(configFile)) {
    fs.unlinkSync(configFile)
    console.log(chalk.cyan.bold('Deleted previous config'))
  }
}

function updateGitIgnore () {
  const ignorePath = '.gitignore'
  const ignoreCompletePath = path.resolve(ignorePath)
  const ignoreContent = '\n#figma-export-icons\nicons-config.json'
  const ignore = fs.existsSync(ignoreCompletePath)
    ? fs.readFileSync(ignoreCompletePath, 'utf-8')
    : ''
  if(!ignore.includes(ignoreContent)) {
    fs.writeFileSync(ignoreCompletePath, ignore + ignoreContent)
    console.log(`Updated ${ignorePath} : ${ignoreContent}`)
  }
}

function getConfig () {
  return new Promise((resolve) => {
    const configFile = path.resolve(defaults.configFileName)
    if (fs.existsSync(configFile)) {
      config = JSON.parse(fs.readFileSync(configFile, 'utf-8'))
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
  fs.writeFileSync('icons-config.json', JSON.stringify(config, null, 2))
}

function deleteIcons () {
  return new Promise((resolve) => {
    const directory = path.resolve(config.iconsPath)
    if (!fs.existsSync(directory)){
      console.log(`Directory ${config.iconsPath} does not exist`)
      if (mkdirp.sync(directory)) {
        console.log(`Created directory ${config.iconsPath}`)
        resolve()
      }
    } else {
      fs.readdir(directory, (err, files) => {
        if (err) throw err
        spinner.start('Deleting directory contents')
        files.forEach((file) => {
          if (file !== 'README.md') {
            fs.unlinkSync(path.join(directory, file))
          }
        })
        spinner.succeed()
        resolve()
      })
    }
  })
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
    figmaClient.get(`/files/${config.fileId}`)
      .then((res) => {
        const endTime = new Date().getTime()
        spinner.succeed()
        console.log(chalk.cyan.bold(`Finished in ${(endTime - res.config.startTime) / 1000}s\n`))
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
    figmaClient.get(`/images/${config.fileId}?ids=${iconIds}&format=svg`)
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
  const imagePath = path.resolve(config.iconsPath, `${name}.svg`)
  const writer = fs.createWriteStream(imagePath)


  axios.get(url, {responseType: 'stream'})
    .then((res) => {
      res.data.pipe(writer)
    })
    .catch((err) => {
      spinner.fail()
      console.log(name)
      console.log(err.message)
      console.log(err.config.url)
      console.log('Please try again')
      process.exit(1)
    })

  return new Promise((resolve, reject) => {
    writer.on('finish', () => {
      // console.log(`Saved ${name}.svg`)
      resolve({
        name: `${name}.svg`,
        size: fs.statSync(imagePath).size
      })
    })
    writer.on('error', (err) => {
      console.log('error writting', err)
      reject(err)
    })
  })

}

function makeRow (a, b) {
  return `  ${a}\t    ${b}\t`
}

function formatSize (size) {
  return (size / 1024).toFixed(2) + ' KiB'
}

function makeResultsTable (results) {
  ui.div(
    makeRow(
      chalk.cyan.bold(`File`),
      chalk.cyan.bold(`Size`),
    ) + `\n\n` +
    results.map(asset => makeRow(
      asset.name.includes('-duplicate-name')
        ? chalk.red.bold(asset.name)
        : chalk.green(asset.name),
      formatSize(asset.size)
    )).join(`\n`)
  )
  return ui.toString()
}

function exportIcons () {
  getFigmaFile()
    .then((res) => {
      getImages(res)
        .then((icons) => {
          console.log(`Api returned ${icons.length} icons\n`)
          deleteIcons().then(() => {
            spinner.start('Downloading')
            const AllIcons = icons.map(icon => downloadImage(icon.image, icon.name))
            Promise.all(AllIcons).then((res) => {
              spinner.succeed(chalk.cyan.bold('Download Finished!\n'))
              console.log(`${makeResultsTable(res)}\n`)
            })
          })
        })
        .catch((err) => {
          console.log(chalk.red(err))
        })
  })
}

function run () {
  updateGitIgnore()
  if (process.argv[2] && process.argv[2] === '-c') {
    deleteConfig()
  }
  getConfig().then(() => {
    figmaClient = figma(config.figmaPersonalToken)
    exportIcons()
  })
}

run()
