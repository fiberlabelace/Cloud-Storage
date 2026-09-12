const express = require('express');
const multer = require('multer');
const app = express();
const upload = multer({dest: 'uploads/'});
const fs = require('fs');

app.get('/', (req, res) =>{
    res.send('Server is working')
})

app.get('/api/files', (req, res)=>{
    fs.readdir('uploads/', (err, files) => {
        res.json({
            filename: files
        })
    })
})

app.post('/api/files', upload.single('myFile'), (req,res)=>{
    console.log(req.file)
    res.json({
        originalname: req.file.originalname,
        filename: req.file.filename,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path
    })
})

app.listen(3000, () => {
    console.log('Server is working')
})

app.delete('/api/files/:filename', (req, res) => {
    fs.unlink('uploads/' + req.params.filename, (err) => {
        if(err){
            console.log('Error: No file detected')
            return res.status(404).json({
                error: 'File not found'
            })
        }
        res.json({
            filename: req.params.filename
        })
    })
})