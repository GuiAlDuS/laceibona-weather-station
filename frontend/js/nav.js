// Highlights the menu entry of the section being read, and keeps it visible in the narrow-screen bar.
export function initNav() {
  const nav = document.querySelector(".side-nav");
  if (!nav) return;
  const links = [...nav.querySelectorAll("a")];
  const groups = links.map((a) => document.getElementById(a.hash.slice(1))).filter(Boolean);
  let active = null;

  function update() {
    // The current section is the last one whose top has passed a third of the way down the window.
    const line = window.innerHeight * 0.33;
    let current = groups[0];
    for (const g of groups) if (g.getBoundingClientRect().top <= line) current = g;
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) current = groups.at(-1);
    if (current === active) return;
    active = current;
    for (const a of links) {
      if (a.hash === `#${current.id}`) {
        a.setAttribute("aria-current", "true");
        const bar = a.closest("ul");
        if (bar && bar.scrollWidth > bar.clientWidth) bar.scrollTo({ left: a.offsetLeft - (bar.clientWidth - a.offsetWidth) / 2, behavior: "smooth" });
      } else a.removeAttribute("aria-current");
    }
  }

  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      update();
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();
}
