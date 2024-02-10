type Props = {
  numRows: number;
  rowComponent: React.ReactNode | ((index: number) => React.ReactNode);
}

const HasManyRows = ({ numRows, rowComponent }: Props) => {
  return (
    <>
      {[...Array(numRows)].map((_, index) =>
        rowComponent instanceof Function ? rowComponent(index) : rowComponent
      )}
    </>
  )
}

export default HasManyRows;