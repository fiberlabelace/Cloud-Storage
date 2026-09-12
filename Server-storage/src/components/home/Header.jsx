import React from 'react'


const Header = () => {
  return (
    <div>
      <div>
        <nav className="navbar navbar-expand-lg bg-body-tertiary">
          <div className="container-fluid">
            <img src="./public/logo.png" alt="Logo" className="navbar-brand ms-5" width="150vw" height="auto"/>
            <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
              <span className="navbar-toggler-icon" />
            </button>
            <div className="collapse navbar-collapse" id="navbarSupportedContent">
              <form className="d-flex w-50 mx-auto" role="search">
                <input className="form-control me-2 rounded-pill" type="search" placeholder="Search" aria-label="Search" />
              </form>
              <a className="user">
                <img src="./public/user.png" alt="User" className="navbar-brand ms-5" width="50vw" height="auto"/>
              </a>
            </div>
          </div>
        </nav>
      </div>
    </div>
  )
}

export default Header
