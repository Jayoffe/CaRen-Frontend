export default function UserHeader({ user, title = 'Dashboard' }) { return <header className='panel'><h2>{title}</h2>{user && <span>Welcome, {user.full_name || user.username}</span>}</header> }
