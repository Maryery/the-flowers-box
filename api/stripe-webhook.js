const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const { obtenerSupabase } = require('./_lib/supabase');

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

async function guardarPedido(pedido) {
	const supabase = obtenerSupabase();

	const { data, error } = await supabase
		.from('pedidos')
		.upsert(
			{
				stripe_session_id: pedido.sessionId,
				stripe_payment_intent_id: pedido.paymentIntent,
				idioma: pedido.idioma,
				nombre: pedido.nombre,
				telefono: pedido.telefono,
				email: pedido.email,
				producto: pedido.producto,
				fecha_entrega: pedido.fecha,
				destinatario: pedido.destinatario,
				zona: pedido.zona,
				direccion: pedido.direccion,
				dedicatoria: pedido.dedicatoria,
				comentarios: pedido.comentarios,
				total_centimos: pedido.total,
				moneda: pedido.moneda,
				estado_pago: 'pagado',
			},
			{ onConflict: 'stripe_session_id', ignoreDuplicates: true }
		)
		.select('id, estado_correos')
		.maybeSingle();

	if (error) {
		throw new Error(`Error guardando pedido: ${error.message}`);
	}

	return data;
}

async function consultarEstadoCorreos(sessionId) {
	const supabase = obtenerSupabase();

	const { data, error } = await supabase
		.from('pedidos')
		.select(
			'estado_correos, correo_cliente_enviado_en, correo_tienda_enviado_en'
		)
		.eq('stripe_session_id', sessionId)
		.single();

	if (error) {
		throw new Error(`Error consultando el pedido: ${error.message}`);
	}

	return data;
}

async function reservarEnvioPedido(sessionId) {
	const supabase = obtenerSupabase();

	const { data, error } = await supabase.rpc('reservar_envio_pedido', {
		p_stripe_session_id: sessionId,
	});

	if (error) {
		throw new Error(`Error reservando el envío: ${error.message}`);
	}

	return data === true;
}

async function marcarCorreoEnviado(sessionId, tipo) {
	const columna =
		tipo === 'cliente'
			? 'correo_cliente_enviado_en'
			: tipo === 'tienda'
				? 'correo_tienda_enviado_en'
				: null;

	if (!columna) {
		throw new Error('Tipo de correo no válido.');
	}

	const supabase = obtenerSupabase();

	const { error } = await supabase
		.from('pedidos')
		.update({
			[columna]: new Date().toISOString(),
		})
		.eq('stripe_session_id', sessionId);

	if (error) {
		throw new Error(`Error registrando correo enviado: ${error.message}`);
	}
}

async function marcarErrorEnvioPedido(sessionId, motivoError) {
	const supabase = obtenerSupabase();

	const { error } = await supabase.rpc('marcar_error_envio_pedido', {
		p_stripe_session_id: sessionId,
		p_error: motivoError,
	});

	if (error) {
		throw new Error(
			`Error actualizando el estado del pedido: ${error.message}`
		);
	}
}

async function completarEnvioPedido(sessionId) {
	const supabase = obtenerSupabase();

	const { data, error } = await supabase.rpc('completar_envio_pedido', {
		p_stripe_session_id: sessionId,
	});

	if (error) {
		throw new Error(`Error completando el pedido: ${error.message}`);
	}

	if (data !== true) {
		throw new Error('No se pudo confirmar el envío de ambos correos.');
	}
}

async function enviarCorreosPedido(pedido, estadoCorreos = {}) {
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

	// 1. Confirmación para el cliente en español o inglés
	const ingles = pedido.idioma === 'en';

	const asuntoCliente = ingles
		? `Order confirmation · ${pedido.producto}`
		: `Confirmación de tu pedido · ${pedido.producto}`;

	const contenidoCliente = ingles
		? `
			<div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #202018; line-height: 1.6;">
				<h1 style="color: #F26B4F; font-size: 28px;">
					Thank you for your order
				</h1>

				<p>Hello ${nombre},</p>

				<p>
					We have successfully received your payment
					for your order at <strong>The Flowers Box</strong>.
				</p>

				<div style="background: #fffaf6; padding: 24px; margin: 24px 0; border-radius: 12px;">
					<p><strong>Flower Box:</strong> ${producto}</p>
					<p><strong>Contents:</strong> 25 flowers</p>
					<p><strong>Delivery date:</strong> ${fecha}</p>
					<p><strong>Recipient:</strong> ${destinatario}</p>
					<p><strong>Delivery area:</strong> ${zona}</p>
					<p><strong>Address:</strong> ${direccion}</p>
					<p><strong>Delivery:</strong> Free</p>
					<p><strong>Total paid:</strong> ${total}</p>
				</div>

				${dedicatoria ? `<p><strong>Gift message:</strong><br>${dedicatoria}</p>` : ''}

				<p>
					We will carefully prepare your Flower Box
					with selected fresh flowers and attention to every detail.
				</p>

				<p>
					Thank you for choosing <strong>The Flowers Box</strong>.
				</p>
			</div>
		`
		: `
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
		`;

	if (!estadoCorreos.correo_cliente_enviado_en) {
		await transporter.sendMail({
			from: `"The Flowers Box" <${GMAIL_USER}>`,
			to: pedido.email,
			replyTo: GMAIL_USER,
			subject: asuntoCliente,
			html: contenidoCliente,
		});

		await marcarCorreoEnviado(pedido.sessionId, 'cliente');
	}

	// 2. Aviso completo para The Flowers Box
	if (!estadoCorreos.correo_tienda_enviado_en) {
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

		await marcarCorreoEnviado(pedido.sessionId, 'tienda');
	}
}

export async function POST(request) {
	const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

	if (!webhookSecret) {
		console.error('Falta STRIPE_WEBHOOK_SECRET');

		return Response.json({ error: 'Webhook no configurado' }, { status: 500 });
	}

	const signature = request.headers.get('stripe-signature');

	let event;

	try {
		const rawBody = await request.text();

		event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
	} catch (error) {
		console.error('Firma de Stripe no válida:', error.message);

		return Response.json(
			{ error: 'Firma del webhook no válida' },
			{ status: 400 }
		);
	}

	try {
		if (event.type === 'checkout.session.completed') {
			const session = event.data.object;

			if (session.payment_status === 'paid') {
				const pedido = {
					sessionId: session.id,
					paymentIntent: session.payment_intent,
					idioma: session.metadata?.idioma === 'en' ? 'en' : 'es',
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
				console.log('PEDIDO CONFIRMADO:', {
					sessionId: pedido.sessionId,
					producto: pedido.producto,
					total: pedido.total,
					moneda: pedido.moneda,
				});

				await guardarPedido(pedido);
				console.log('PEDIDO REGISTRADO EN SUPABASE:', pedido.sessionId);

				if (!pedido.email) {
					throw new Error('El pedido pagado no contiene un email de cliente.');
				} else {
					const envioReservado = await reservarEnvioPedido(pedido.sessionId);

					if (envioReservado) {
						const estadoCorreos = await consultarEstadoCorreos(
							pedido.sessionId
						);

						try {
							await enviarCorreosPedido(pedido, estadoCorreos);

							await completarEnvioPedido(pedido.sessionId);

							console.log(
								'PEDIDO COMPLETADO Y CORREOS REGISTRADOS:',
								pedido.sessionId
							);
						} catch (emailError) {
							console.error(
								'ERROR ENVIANDO LOS CORREOS DEL PEDIDO:',
								emailError.message
							);

							await marcarErrorEnvioPedido(
								pedido.sessionId,
								emailError.message
							);

							throw emailError;
						}
					} else {
						const estadoActual = await consultarEstadoCorreos(pedido.sessionId);

						if (estadoActual.estado_correos === 'enviado') {
							console.log('PEDIDO YA COMPLETADO:', pedido.sessionId);
						} else {
							console.error(
								'PEDIDO PENDIENTE DE REVISIÓN:',
								pedido.sessionId,
								estadoActual.estado_correos
							);

							throw new Error(
								'El pedido no está completado y necesita revisión.'
							);
						}
					}
				}
			}
		}

		return Response.json({ received: true }, { status: 200 });
	} catch (error) {
		console.error('Error procesando webhook de Stripe:', error.message);

		return Response.json(
			{ error: 'Error interno procesando el pedido' },
			{ status: 500 }
		);
	}
}
