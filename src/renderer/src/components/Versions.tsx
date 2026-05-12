import { useState } from 'react'

function Versions(): React.JSX.Element {
  const [versions] = useState({
    browser: navigator.userAgent
  })

  return (
    <ul className="versions">
      <li className="browser-version">Browser {versions.browser}</li>
    </ul>
  )
}

export default Versions
