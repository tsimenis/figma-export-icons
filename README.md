# figma-export-icons

 > Command line script to export and download icons from a Figma file using the Figma REST api.
 
 ## Install
 ### Global
 `npm install -g figma-export-icons`
 ### Local
 `npm install figma-export-icons --save`
 
 ## Usage
 If you have installed the module globally:
 `export-icons`
 
 If you have installed it locally:
 
 Create a script in your package.json
 ```js
scripts: {
  'export-icons': 'export-icons'
}
```
and run `npm run export-icons`

OR

run it directly with `npx export-icons`
 
 
## Note:
 If icons in figma have the same name it will rename them to `${iconName}-duplicate-name.svg` and
 you will get an error in the console: Please fix the figma file to not contain duplicates
