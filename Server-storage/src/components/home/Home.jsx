import React, {useState}from 'react'
import Header from './Header'
import Side from './Side/Side'
import FilesList from './FilesList/FilesList'

const Home = () => {
  const [files, setFiles] = useState([])
  return (
    <div>
      <Header/>
      <div className='d-flex'>
        <Side files={files} setFiles={setFiles}/>
        <FilesList files={files}/>
      </div>
      
    </div>
  )
}

export default Home
