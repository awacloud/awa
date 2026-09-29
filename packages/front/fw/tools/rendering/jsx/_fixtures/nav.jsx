<nav id="main-nav">
  <ul id="nav-list">
    <Each name="items">
      <li><a href="{href}">{label}</a></li>
    </Each>
  </ul>
  <span id="nav-title"><Slot name="pageTitle"/></span>
</nav>
