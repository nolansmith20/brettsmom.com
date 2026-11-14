const toggle = document.querySelector("[data-nav-toggle]");
const links = document.querySelector("[data-nav-links]");

if (toggle && links) {
  toggle.addEventListener("click", () => {
    const open = links.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "Close" : "Menu";
  });

  links.addEventListener("click", (event) => {
    if (!event.target.closest("a")) return;
    links.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "Menu";
  });
}

document.querySelectorAll(".faq-item").forEach((item) => {
  const button = item.querySelector("button");
  if (!button) return;
  button.addEventListener("click", () => {
    const open = item.classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(open));
  });
});
