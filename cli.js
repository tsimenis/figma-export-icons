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
const argv = require('minimist')(process.argv.slice(2))
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
  const configPath = argv.config || defaults.configFileName
  const ignoreCompletePath = path.resolve(ignorePath)
  if (fs.existsSync(configPath)) {
    const ignoreContent = `\n#figma-export-icons\n${configPath}`
    const ignore = fs.existsSync(ignoreCompletePath)
      ? fs.readFileSync(ignoreCompletePath, 'utf-8')
      : ''
    if(!ignore.includes(ignoreContent)) {
      fs.writeFileSync(ignoreCompletePath, ignore + ignoreContent)
      console.log(`Updated ${ignorePath} : ${ignoreContent}`)
    }
  }
}

function getConfig () {
  return new Promise((resolve) => {
    const configFile = path.resolve(argv.config || defaults.configFileName)
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

function createOutputDirectory () {
  return new Promise((resolve) => {
    const directory = path.resolve(config.iconsPath)
    if (!fs.existsSync(directory)) {
      console.log(`Directory ${config.iconsPath} does not exist`)
      if (mkdirp.sync(directory)) {
        console.log(`Created directory ${config.iconsPath}`)
        resolve()
      }
    } else {
      resolve()
    }
  })
}

function deleteIcon (iconPath) {
  return new Promise((resolve) => {
    fs.unlink(iconPath, (err) => {
      if (err) throw err
      // if no error, file has been deleted successfully
      resolve()
    })
  })
}

function deleteDirectory (directory) {
  return new Promise((resolve) => {
    fs.rmdir(directory, (err) => {
      if (err) throw err
      resolve()
    })
  })
}

function deleteIcons () {
  return new Promise((resolve) => {
    const directory = path.resolve(config.iconsPath)
    // read icons directory files
    fs.readdir(directory, (err, files) => {
      if (err) throw err
      spinner.start('Deleting directory contents')
      let filesToDelete = []
      let subdirectories = []
      files.forEach((file) => {
        const hasSubdirectory = fs.lstatSync(path.join(directory, file)).isDirectory()
        if (hasSubdirectory) {
          const subdirectory = path.join(directory, file)
          subdirectories.push(subdirectory)
          // read subdirectory
          fs.readdir(subdirectory, (err, files) => {
            if (err) throw err
            files.forEach(file => filesToDelete.push(deleteIcon(path.join(subdirectory, file))))
          })
        } else {
          if (file !== 'README.md') {
            filesToDelete.push(deleteIcon(path.join(directory, file)))
          }
        }
      })
      Promise.all(filesToDelete).then(() => {
        const directoriesToDelete = subdirectories.map(subdirectory => deleteDirectory(subdirectory))
        Promise.all(directoriesToDelete).then(() => {
          spinner.succeed()
          resolve()
        })
      })
    })
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

function getPathToFrame(root, current) {
  if(!current.length) return root
  const path = [...current]
  const name = path.shift()
  const foundChild = root.children.find(c => c.name === name)
  if (!foundChild) return root;
  return getPathToFrame(foundChild, path)
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
        const shouldGetFrame = isNaN(config.frame) && parseInt(config.frame) !== -1
        let iconsArray = page.children
        if (shouldGetFrame) {
          const frameNameArr = config.frame.split('/').filter(Boolean)
          const frameName = frameNameArr.pop()
          const frameRoot = getPathToFrame(page, frameNameArr)
          if (!frameRoot.children.find(c => c.name === frameName)) {
            console.log(chalk.red.bold('Cannot find', chalk.white.bgRed(frameName), 'Frame in this Page, check your settings'))
            return
          }
          iconsArray = frameRoot.children.find(c => c.name === frameName).children
        }
        let icons = iconsArray.flatMap((icon) => {
          if ( config.exportVariants &&  icon.children && icon.children.length > 0 ) {
            return icon.children.map((child) => {
              const variants = child.name.split(',').map((prop, index) => {
                return prop.trim().replace('=', '-').toLowerCase();
              }).join('--');
              return { id: child.id, name: icon.name + '__' + variants }
            });
          } else {
            return [{ id: icon.id, name: icon.name }]
          }
        });
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
  let nameClean = name
  let directory = config.iconsPath
  const idx = name.lastIndexOf('/')
  if (idx !== -1) {
    directory = directory + '/' + name.substring(0, idx)
    nameClean = name.substring(idx + 1)
    if (!fs.existsSync(directory)) {
      if (mkdirp.sync(directory)) {
        console.log(`\nCreated sub directory ${directory}`)
        iconPath = directory
      } else {
        console.log('Cannot create directories')
        process.exit(1)
      }
    }
  }
  const imagePath = path.resolve(directory, `${nameClean}.svg`)
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
      console.log(chalk.red.bold('Something went wrong fetching the image from S3, please try again'),)
      process.exit(1)
    })

  return new Promise((resolve, reject) => {
    writer.on('finish', () => {
      // console.log(`Saved ${name}.svg`, fs.statSync(imagePath).size)
      resolve({
        name: `${name}.svg`,
        size: fs.statSync(imagePath).size
      })
    })
    writer.on('error', (err) => {
      console.log('error writting file', err)
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
function removeFromName(name) {
  return name.replace(config.removeFromName, '')
}
function exportIcons () {
  getFigmaFile()
    .then((res) => {
      getImages(res)
        .then((icons) => {
          console.log(`Api returned ${icons.length} icons\n`)
          createOutputDirectory()
          .then(() => {
            deleteIcons().then(() => {
              spinner.start('Downloading')
              const AllIcons = icons.map(icon => downloadImage(icon.image, removeFromName(icon.name)))
              // const AllIcons = []
              Promise.all(AllIcons).then((res) => {
                spinner.succeed(chalk.cyan.bold('Download Finished!\n'))
                console.log(`${makeResultsTable(res)}\n`)
              })
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
  if (argv.c) {
    deleteConfig()
  }
  getConfig().then(() => {
    figmaClient = figma(config.figmaPersonalToken)
    exportIcons()
  })
}

run()
