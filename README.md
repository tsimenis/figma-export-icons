# figma-export-icons

 <a href="https://www.npmjs.com/package/figma-export-icons"><img src="https://badgen.net/npm/v/figma-export-icons" alt="Version"></a>
 <a href="https://www.npmjs.com/package/figma-export-icons"><img src="https://badgen.net/npm/dm/figma-export-icons" alt="Downloads"></a>

 > Command line script to export and download icons from a Figma file using the Figma REST api.

## Description

 Running the script will bring up a wizard to fill in the config for fetching the assets. You can also provide the icons-config.json yourself, then the wizard is skipped.
 After the config is provided, the figma file is fetched and parsed to find the icons frame, the files are downloaded and put locally in the directory provided in the config.

 example config file:

 ```json
{
  "figmaPersonalToken": "YOUR_PERSONAL_TOKEN",
  "fileId": "FILE_ID",
  "page": "Identity",
  "frame": "Icons",
  "iconsPath": "assets/svg/icons",
  "removeFromName": "Icon="
}
```
Update: from > v1.3.0 you can set the frame to -1 and it will fetch the icons from the whole page.


## Features

 - Wizard to generate config, you will be prompted for any missing key
 - icons-config.json is automatically added to .gitignore if it exists
 - Directory to save the icons is created if it doesn't exist
 - Icons are deleted from local directory when fetching new
 - Icons with the same name are marked with `${iconName}-duplicate-name.svg` so you can easily spot them and fix figma file
 - Running the script with `-c` will clear the config and run the wizard again
 - You can use a custom path to your configuration file with `--config=path/to/config.json`
 - `frame` can be a path if your icons are nested, e.g. `frame="Atoms/icons"`

 ## Installation

 Install the cli globally so you can use it on any directory

 ```sh
 npm install -g figma-export-icons
```

 Or if you prefer install it in your project

```sh
npm install figma-export-icons --save
```

## Usage

 If you have installed the module globally:
 ```sh
 $ export-icons
```

 If you have installed it locally:

 Create a script in your package.json
 ```js
scripts: {
  'export-icons': 'export-icons'
}
```
and run
```sh
npm run export-icons
```

OR

run it directly with:
```sh
npx export-icons
```

## Credits

This script was developed and is part of our tools at [Qikker Online](https://qikkeronline.com).
