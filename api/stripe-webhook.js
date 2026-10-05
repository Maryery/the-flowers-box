const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

const transporter = nodemailer.createTransport({
	service: 'gmail',
	auth: {
		user: GMAIL_USER,
		pass: GMAIL_APP_PASSWORD,
	},
});

function escaparHtml(valor = '') {
	return String(valor)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

function formatearFecha(fecha) {
	if (!fecha) return '';

	const [year, month, day] = fecha.split('-');

	if (!year || !month || !day) return fecha;

	return `${day}/${month}/${year}`;
}

function formatearTotal(total, moneda = 'eur') {
	return new Intl.NumberFormat('es-ES', {
		style: 'currency',
		currency: moneda.toUpperCase(),
	}).format((total || 0) / 100);
}

async function enviarCorreosPedido(pedido) {
	if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
		throw new Error('Faltan las variables de entorno de Gmail.');
	}

	const total = formatearTotal(pedido.total, pedido.moneda);
	const fecha = formatearFecha(pedido.fecha);

	const nombre = escaparHtml(pedido.nombre);
	const producto = escaparHtml(pedido.producto);
	const destinatario = escaparHtml(pedido.destinatario);
	const zona = escaparHtml(pedido.zona);
	const direccion = escaparHtml(pedido.direccion);
	const telefono = escaparHtml(pedido.telefono);
	const email = escaparHtml(pedido.email);
	const dedicatoria = escaparHtml(pedido.dedicatoria);
	const comentarios = escaparHtml(pedido.comentarios);

	// 1. Confirmación para el cliente
	await transporter.sendMail({
		from: `"The Flowers Box" <${GMAIL_USER}>`,
		to: pedido.email,
		replyTo: GMAIL_USER,
		subject: `Confirmación de tu pedido · ${pedido.producto}`,
		html: `
			<div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #202018; line-height: 1.6;">
				<h1 style="color: #F26B4F; font-size: 28px;">
					Gracias por tu pedido
				</h1>

				<p>Hola ${nombre},</p>

				<p>
					Hemos recibido correctamente el pago de tu pedido en
					<strong>The Flowers Box</strong>.
				</p>

				<div style="background: #fffaf6; padding: 24px; margin: 24px 0; border-radius: 12px;">
					<p><strong>Flower Box:</strong> ${producto}</p>
					<p><strong>Contenido:</strong> 25 flores</p>
					<p><strong>Fecha de entrega:</strong> ${fecha}</p>
					<p><strong>Destinatario:</strong> ${destinatario}</p>
					<p><strong>Zona:</strong> ${zona}</p>
					<p><strong>Dirección:</strong> ${direccion}</p>
					<p><strong>Entrega:</strong> Gratuita</p>
					<p><strong>Total pagado:</strong> ${total}</p>
				</div>

				${dedicatoria ? `<p><strong>Dedicatoria:</strong><br>${dedicatoria}</p>` : ''}

				<p>
					Prepararemos tu Flower Box con flores frescas seleccionadas
					y cuidando cada detalle.
				</p>

				<p>
					Gracias por confiar en <strong>The Flowers Box</strong>.
				</p>
			</div>
		`,
	});

	// 2. Aviso completo para The Flowers Box
	await transporter.sendMail({
		from: `"Pedidos The Flowers Box" <${GMAIL_USER}>`,
		to: GMAIL_USER,
		replyTo: pedido.email,
		subject: `NUEVO PEDIDO PAGADO · ${pedido.producto} · ${fecha}`,
		html: `
			<div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; color: #202018; line-height: 1.6;">
				<h1 style="color: #F26B4F; font-size: 28px;">
					Nuevo pedido pagado
				</h1>

				<p>
					Stripe ha confirmado correctamente el pago de este pedido.
				</p>

				<div style="background: #fffaf6; padding: 24px; margin: 24px 0; border-radius: 12px;">
					<p><strong>Flower Box:</strong> ${producto}</p>
					<p><strong>Contenido:</strong> 25 flores</p>
					<p><strong>Total:</strong> ${total}</p>

					<hr style="border: 0; border-top: 1px solid #dfd1c8; margin: 20px 0;">

					<p><strong>Cliente:</strong> ${nombre}</p>
					<p><strong>Teléfono:</strong> ${telefono}</p>
					<p><strong>Email:</strong> ${email}</p>

					<hr style="border: 0; border-top: 1px solid #dfd1c8; margin: 20px 0;">

					<p><strong>Fecha de entrega:</strong> ${fecha}</p>
					<p><strong>Destinatario:</strong> ${destinatario}</p>
					<p><strong>Zona:</strong> ${zona}</p>
					<p><strong>Dirección:</strong> ${direccion}</p>

					<p>
						<strong>Dedicatoria:</strong><br>
						${dedicatoria || 'Sin dedicatoria'}
					</p>

					<p>
						<strong>Comentarios:</strong><br>
						${comentarios || 'Sin comentarios'}
					</p>
				</div>

				<p style="font-size: 12px; color: #69675f;">
					Stripe Session: ${escaparHtml(pedido.sessionId)}
				</p>
			</div>
		`,
	});
}

export async function POST(request) {
	const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

	if (!webhookSecret) {
		console.error('Falta STRIPE_WEBHOOK_SECRET');

		return Response.json({ error: 'Webhook no configurado' }, { status: 500 });
	}

	const signature = request.headers.get('stripe-signature');

	try {
		const rawBody = await request.text();

		const event = stripe.webhooks.constructEvent(
			rawBody,
			signature,
			webhookSecret
		);

		if (event.type === 'checkout.session.completed') {
			const session = event.data.object;

			if (session.payment_status === 'paid') {
				const pedido = {
					sessionId: session.id,
					paymentIntent: session.payment_intent,
					email: session.customer_details?.email || '',
					nombre: session.metadata?.nombre || '',
					telefono: session.metadata?.telefono || '',
					producto: session.metadata?.producto || '',
					fecha: session.metadata?.fecha || '',
					destinatario: session.metadata?.destinatario || '',
					zona: session.metadata?.zona || '',
					direccion: session.metadata?.direccion || '',
					dedicatoria: session.metadata?.dedicatoria || '',
					comentarios: session.metadata?.comentarios || '',
					total: session.amount_total,
					moneda: session.currency,
				};

				console.log('PAGO CONFIRMADO POR STRIPE');
				console.log('PEDIDO CONFIRMADO:', pedido);

				if (!pedido.email) {
					console.error('El pedido no contiene un email de cliente.');
				} else {
					try {
						await enviarCorreosPedido(pedido);

						console.log('CORREOS DEL PEDIDO ENVIADOS CORRECTAMENTE');
					} catch (emailError) {
						console.error(
							'ERROR ENVIANDO LOS CORREOS DEL PEDIDO:',
							emailError.message
						);
					}
				}
			}
		}

		return Response.json({ received: true }, { status: 200 });
	} catch (error) {
		console.error('Error verificando webhook de Stripe:', error.message);

		return Response.json(
			{ error: 'Firma del webhook no válida' },
			{ status: 400 }
		);
	}
}
