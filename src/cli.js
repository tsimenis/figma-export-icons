#!/usr/bin/env node

/*
 * This script fetches svg icons from Figma file.
 *
 * Dependencies:
 *
 *  - axios
 *  - prompts
 *  - ora
 *  - chalk
 *  - mkdirp
 *
 * What this script does:
 * - deletes all icons inside assets/svg/icons
 * - fetches the Figma file
 * - filters the figma file to find the Page that has the icons (e.g Identity)
 * - filters the page to find the Artboard/Frame that contains the icons (e.g Icons)
 * - makes a call to figma api with the icon ids to generate the images
 * - images returned are urls hosted in Amazon S3
 * - downloads images in assets/svg/icons
 *
 * Note:
 * If icons in figma have the same name it will rename them to iconName-duplicate-name
 * You will get an error in the console. Please fix the figma file to not contain duplicates
 */

const DEFAULT_PAGE = 'Identity'
const DEFAULT_FRAME = 'Icons'
const DEFAULT_ICONS_PATH = 'assets/svg/icons'

require('dotenv').config()
const Fs = require('fs')
const Path = require('path')
const ora = require('ora')
const chalk = require('chalk')
const Axios = require('axios')
const figmaApiBase = 'https://api.figma.com/v1'
const prompts = require('prompts')
const mkdirp = require('mkdirp')

let config = {
  figmaPersonalToken: process.env.FIGMA_PERSONAL_TOKEN
}

function deleteConfig () {
  const configFile = 'icons-config.json'
  return new Promise((resolve) => {
    Fs.access(configFile, (err) => {
      if (!err) {
        Fs.unlinkSync(configFile)
        console.log(chalk.cyan.bold('Deleted previous config'))
      }
      resolve(true)
    })
  })
}

async function getConfig () {
  await new Promise((resolve) => {
    Fs.access('icons-config.json', (err) => {
      if (!err) {
        Fs.readFile('icons-config.json', (err, data) => {
          if (err) return err
          config = JSON.parse(data)
          const missingQuestions = questions.filter((q) => !config[q.name])
          if (missingQuestions.length > 0) {
            getPromptData().then(() => {
              resolve(true)
            })
          } else {
            resolve(true)
          }
        })
      } else {
        getPromptData().then(() => {
          resolve(true)
        })
      }
    })
  })
}

const questions = [
  {
    type: 'text',
    name: 'figmaPersonalToken',
    message: 'Your figma token:',
    validate: value => value === '' ? 'Generate a personal token for figma, read here: \n https://www.figma.com/developers/docs#authentication' : true
  },
  {
    type: 'text',
    name: 'fileId',
    message: 'What is the figma file ID?',
    validate: value => value === '' ? 'Visit figma project in the browser and copy the id: \n https://www.figma.com/file/FILE-ID/project-name' : true
  },
  {
    type: 'text',
    name: 'page',
    message: 'Name of the page with icons?',
    initial: DEFAULT_PAGE
  },
  {
    type: 'text',
    name: 'frame',
    message: 'Name of the frame with icons',
    initial: DEFAULT_FRAME
  },
  {
    type: 'text',
    name: 'iconsPath',
    message: 'Directory to download the icons to',
    initial: DEFAULT_ICONS_PATH
  }
]

async function getPromptData () {
  const onCancel = prompt => {
    process.exit(1)
  }
  const missingQuestions = questions.filter((q) => !config[q.name])
  const response = await prompts(missingQuestions, { onCancel })
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
let spinner = ora()

function deleteIcons () {
  const directory = Path.resolve(config.iconsPath)
  return new Promise((resolve) => {
    if (!Fs.existsSync(directory)){
      console.log(`Directory ${config.iconsPath} does not exist`)
      mkdirp(directory, function (err) {
        if (err) console.error(err)
        else console.log(`Created directory ${config.iconsPath}`)
        resolve()
      })
    } else {
      Fs.readdir(directory, (err, files) => {
        if (err) throw err
        spinner = ora('Deleting directory contents').start()
        files.forEach((file) => {
          if (file !== 'README.md') {
            Fs.unlinkSync(Path.join(directory, file))
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
      spinner = ora(chalk.bgRed.bold(`Duplicate icon name: ${x[propertyName]}. Please fix figma file`)).fail()
      current[propertyName] = current[propertyName] + '-duplicate-name'
    }
    return acc.concat([current])
  }, [])
}

function getImages () {
  return new Promise((resolve, reject) => {
    spinner = ora('Fetching figma file (this might take a while depending on the figma file size)').start()
    Axios.get(`${figmaApiBase}/files/${config.fileId}`)
      .then((res) => {
        const endTime = new Date().getTime()
        spinner.succeed()
        console.log(chalk.cyan.bold(`Finished in ${(endTime - res.config.startTime) / 1000}s`))
        const page = res.data.document.children.find(c => c.name === config.page)
        if (!page) {
          reject(new Error('Cannot find Icons Page, check your settings'))
          return
        }
        if (!page.children.find(c => c.name === config.frame)) {
          reject(new Error('Cannot find Icons Frame, check your settings'))
          return
        }
        const icons = page.children.find(c => c.name === config.frame).children.map((icon) => {
          return { id: icon.id, name: icon.name }
        })
        findDuplicates('name', icons)
        const iconIds = icons.map(icon => icon.id).join(',')
        spinner = ora('Fetching icon urls').start()
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
            reject(err)
          })
      })
      .catch((err) => {
        spinner.fail()
        if (err.response) {
          console.log(chalk.red.bold(`Cannot get figma file: ${err.response.data.status} ${err.response.data.err}`))
        } else {
          console.log(err)
        }
        process.exit(1)
      })
  })
}

function downloadImage (url, name) {
  const path = Path.resolve(config.iconsPath, `${name}.svg`)
  const writer = Fs.createWriteStream(path)

  Axios.get(url, { responseType: 'stream' })
    .then((res) => {
      res.data.pipe(writer)
    })
    .catch((err) => {
      console.log(name, err.message)
      console.log(err.config.url)
    })

  return new Promise((resolve, reject) => {
    writer.on('finish', () => {
      spinner.stop()
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
  getImages()
    .then((icons) => {
      console.log(`Api returned ${icons.length} icons`)
      spinner = ora('Downloading').start()
      setTimeout(() => {
        const AllIcons = icons.map(icon => downloadImage(icon.image, icon.name))
        Promise.all(AllIcons).then(() => {
          spinner.succeed(chalk.cyan.bold('Download Finished!'))
        })
      }, 300)
    })
    .catch((err) => {
      console.log(chalk.red(err))
    })
}

async function exportIcons () {
  if (process.argv[2] && process.argv[2] === '-c') {
    await deleteConfig()
  }
  await getConfig()
  await deleteIcons()
  await figmaExportIcons()
}

exportIcons()
