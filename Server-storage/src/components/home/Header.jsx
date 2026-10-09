const Header = ({ searchQuery, setSearchQuery }) => {
  return (
    <nav className="navbar navbar-expand bg-transparent px-4 py-2 border-bottom">
      <div className="container-fluid d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center gap-2">
          <span className="fs-4 fw-semibold text-primary">CloudDrive</span>
        </div>

        <div className="w-50 mx-4">
          <div className="input-group">
            <input
              type="search"
              className="form-control rounded-pill bg-light border-0 px-4 py-2"
              placeholder="Search in Drive..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>  

        <div className="d-flex align-items-center gap-3">
          <div
            className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-bold"
            style={{ width: '38px', height: '38px' }}
          >
            FL
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Header;