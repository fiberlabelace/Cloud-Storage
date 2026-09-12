import React, {useState} from 'react'
import './Side.scss'

const Side = () => {
  const [file, setFile] = useState(null);
  const uploadFile = () => {
    const formData = new FormData();
    for(const f of file){
      formData.append('myFile', f);
    }
    fetch('http://100.83.204.64:3000/api/files', {
      method: 'POST',
      body: formData
    })
  }
  return (
    <div className='bg-body-tertiary d-none d-md-flex flex-column side min-vh-100'>
        <input type="file" multiple onChange={(event) => 
          setFile(event.target.files)
        }/>
        <button type="button" onClick={uploadFile} className="btn btn-outline-primary btn-lg mb-4 mt-3 mx-auto">Upload</button>
        <div className='ms-3 d-flex flex-column gap-3 align-items-start'>
           <button type="button" className="btn btn-outline-secondary rounded-4 folder">Layered Files</button> 
           <button type="button" className="btn btn-outline-secondary rounded-4 folder">Digital Courses</button> 
           <button type="button" className="btn btn-outline-secondary rounded-4 folder">Learning Materials</button> 
        </div>
    </div>
  )
}

export default Side
