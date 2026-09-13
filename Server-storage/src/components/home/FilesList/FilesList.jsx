import React from 'react'

const FilesList = ({files}) => {
    console.log(files)
  return (
    <div>
      {files.map(file=>(
        <div key={file}><h1>{file}</h1></div>
      ))}
    </div>
  )
}

export default FilesList
