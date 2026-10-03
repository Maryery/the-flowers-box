const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.main-nav');
const productSelect = document.querySelector('#producto');
const form = document.querySelector('#order-form');
const status = document.querySelector('#form-status');

document.querySelector('#year').textContent = new Date().getFullYear();

menuToggle?.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
});

document.querySelectorAll('.main-nav a').forEach(link => {
  link.addEventListener('click', () => {
    nav.classList.remove('open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  });
});

document.querySelectorAll('.product-button').forEach(button => {
  button.addEventListener('click', () => {
    const card = button.closest('.product-card');
    if (productSelect && card?.dataset.product) productSelect.value = card.dataset.product;
    document.querySelector('#pedido')?.scrollIntoView({ behavior: 'smooth' });
  });
});

const brandLogo = document.querySelector(".header-brand");

brandLogo?.addEventListener("click", event => {
  event.preventDefault();

  window.scrollTo({
    top: 0,
    left: 0,
    behavior: "smooth"
  });
});
