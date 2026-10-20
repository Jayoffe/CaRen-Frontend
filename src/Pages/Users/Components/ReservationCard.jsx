export default function ReservationCard({ reservation }) { return <div className='panel'><h3>Reservation</h3><p>{reservation?.status || 'Pending'}</p></div> }
