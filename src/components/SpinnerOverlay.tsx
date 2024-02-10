import { PropsWithChildren } from "react";
import { Spinner } from "react-bootstrap";

const SpinnerOverlay = ({ children, loading }: PropsWithChildren<{ loading: boolean }>) => (
  <div className="position-relative">
    {children}
    {loading && (
      // <div className="bg-dark bg-opacity-50 position-absolute w-100 h-100 top-0 start-0 d-flex justify-content-center align-items-center">
      <div className="bg-dark bg-opacity-50 position-absolute h-100 top-0 start-0 end-0">
        <Spinner animation="grow" variant="light" className="position-absolute top-50 start-50" />
      </div>

    )}
  </div>
);

export default SpinnerOverlay;