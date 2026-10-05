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
		} = req.body;

		// Comprobamos los campos obligatorios
		if (
			!nombre ||
			!telefono ||
			!email ||
			!producto ||
			!fecha ||
			!destinatario ||
			!zona ||
			!direccion
		) {
			return res.status(400).json({
				error: 'Faltan datos obligatorios del pedido.',
			});
		}

		// Comprobamos que la Flower Box sea una de las disponibles
		if (!PRODUCTOS_VALIDOS.includes(producto)) {
			return res.status(400).json({
				error: 'Flower Box no válida.',
			});
		}

		// Comprobamos que la zona de entrega sea válida
		if (!MUNICIPIOS_VALIDOS.includes(zona)) {
			return res.status(400).json({
				error: 'Zona de entrega no válida.',
			});
		}

		// Validación de la fecha
		const fechaEntrega = new Date(`${fecha}T12:00:00`);

		if (Number.isNaN(fechaEntrega.getTime())) {
			return res.status(400).json({
				error: 'Fecha de entrega no válida.',
			});
		}

		// No se realizan entregas los domingos
		if (fechaEntrega.getDay() === 0) {
			return res.status(400).json({
				error: 'No realizamos entregas los domingos.',
			});
		}

		// Comprobamos que haya al menos 24 horas de antelación
		const ahora = new Date();
		const fechaMinima = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);

		/*
		 * Como el cliente selecciona un día y no una hora concreta,
		 * consideramos válida la fecha si el día seleccionado no es
		 * anterior al día mínimo permitido.
		 */
		const fechaMinimaTexto = [
			fechaMinima.getFullYear(),
			String(fechaMinima.getMonth() + 1).padStart(2, '0'),
			String(fechaMinima.getDate()).padStart(2, '0'),
		].join('-');

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
		const session = await stripe.checkout.sessions.create({
			mode: 'payment',

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

			success_url: `${req.headers.origin}/?pago=correcto`,
			cancel_url: `${req.headers.origin}/#pedido`,
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
