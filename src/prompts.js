const defaults = require('./defaults')

const prompts = [
  {
    type: 'text',
    name: 'figmaPersonalToken',
    message: 'Your figma token:',
    validate: value => value === '' ? 'Generate a personal token for figma, read here:\nhttps://www.figma.com/developers/docs#authentication' : true
  },
  {
    type: 'text',
    name: 'fileId',
    message: 'What is the figma file ID?',
    validate: value => value === '' ? 'Visit figma project in the browser and copy the id:\nhttps://www.figma.com/file/FILE-ID/project-name' : true
  },
  {
    type: 'text',
    name: 'page',
    message: 'Name of the page with icons?',
    initial: defaults.page
  },
  {
    type: 'text',
    name: 'frame',
    message: 'Name of the frame with icons',
    initial: defaults.frame
  },
  {
    type: 'text',
    name: 'iconsPath',
    message: 'Directory to download the icons to',
    initial: defaults.iconsPath
  }
]

module.exports = prompts
