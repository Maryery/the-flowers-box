const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PRICE_ID = 'price_1UMRUGIFAjzManMBBtnc2nor';

const PRODUCTOS_VALIDOS = [
	'Red Passion',
	'Pink Moment',
	'Pure White',
	'Blush Garden',
	'Soft Blush',
	'Pink Harmony',
];

const MUNICIPIOS_VALIDOS = [
	'Arona',
	'Adeje',
	'San Miguel de Abona',
	'Granadilla de Abona',
];

function textoValido(valor, maximo) {
	return (
		typeof valor === 'string' &&
		valor.trim().length > 0 &&
		valor.length <= maximo
	);
}

function textoOpcionalValido(valor, maximo) {
	return (
		valor === undefined ||
		valor === null ||
		(typeof valor === 'string' && valor.length <= maximo)
	);
}

function emailValido(valor) {
	return textoValido(valor, 254) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

module.exports = async function handler(req, res) {
	if (req.method !== 'POST') {
		return res.status(405).json({
			error: 'Método no permitido',
		});
	}

	try {
		const {
			nombre,
			telefono,
			email,
			producto,
			fecha,
			destinatario,
			zona,
			direccion,
			dedicatoria,
			comentarios,
			idioma,
		} = req.body;

		// Comprobamos los campos obligatorios
		// Validamos los datos del pedido

		// Validamos la fecha de entrega según el calendario de Tenerife
		if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
			return res.status(400).json({
				error: 'Formato de fecha no válido.',
			});
		}

		const [year, month, day] = fecha.split('-').map(Number);
		const fechaUTC = new Date(Date.UTC(year, month - 1, day));

		// Comprobamos que la fecha exista realmente
		if (
			fechaUTC.getUTCFullYear() !== year ||
			fechaUTC.getUTCMonth() !== month - 1 ||
			fechaUTC.getUTCDate() !== day
		) {
			return res.status(400).json({
				error: 'Fecha de entrega no válida.',
			});
		}

		// No realizamos entregas los domingos
		if (fechaUTC.getUTCDay() === 0) {
			return res.status(400).json({
				error: 'No realizamos entregas los domingos.',
			});
		}

		// Calculamos la fecha mínima según la hora de Tenerife
		const ahora = new Date();
		const fechaMinima = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);

		const partesFecha = new Intl.DateTimeFormat('en-CA', {
			timeZone: 'Atlantic/Canary',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		}).formatToParts(fechaMinima);

		const obtenerParte = (tipo) =>
			partesFecha.find((parte) => parte.type === tipo).value;

		const fechaMinimaTexto = `${obtenerParte('year')}-${obtenerParte('month')}-${obtenerParte('day')}`;

		if (fecha < fechaMinimaTexto) {
			return res.status(400).json({
				error: 'El pedido debe realizarse con al menos 24 horas de antelación.',
			});
		}

		/*
		 * Creamos la sesión de Stripe.
		 *
		 * El precio NO viene del navegador.
		 * Stripe utiliza exclusivamente PRICE_ID, correspondiente
		 * a la Flower Box de 25 flores por 75 €.
		 */
		console.log('SITE_URL utilizada:', process.env.SITE_URL);
		const session = await stripe.checkout.sessions.create({
			mode: 'payment',

			locale: idioma === 'en' ? 'en' : 'es',

			line_items: [
				{
					price: PRICE_ID,
					quantity: 1,
				},
			],

			customer_email: email,

			/*
			 * Guardamos los datos del pedido en Stripe para recuperarlos
			 * únicamente después de que Stripe confirme el pago.
			 */
			metadata: {
				idioma: idioma === 'en' ? 'en' : 'es',
				nombre: String(nombre).slice(0, 500),
				telefono: String(telefono).slice(0, 500),
				producto: String(producto).slice(0, 500),
				fecha: String(fecha).slice(0, 500),
				destinatario: String(destinatario).slice(0, 500),
				zona: String(zona).slice(0, 500),
				direccion: String(direccion).slice(0, 500),
				dedicatoria: String(dedicatoria || '').slice(0, 500),
				comentarios: String(comentarios || '').slice(0, 500),
			},

			success_url: `${process.env.SITE_URL}/${idioma === 'en' ? 'index-en.html' : ''}?pago=correcto`,
			cancel_url: `${process.env.SITE_URL}/${idioma === 'en' ? 'index-en.html' : ''}#pedido`,
		});

		return res.status(200).json({
			url: session.url,
		});
	} catch (error) {
		console.error('Error creando sesión de Stripe:', error);

		return res.status(500).json({
			error: 'No se pudo iniciar el pago.',
		});
	}
};
