const express = require('express');
const app = express();
app.use(express.json());

// ========================================
// BANCO DE DADOS EM MEMÓRIA
// ========================================
let pedidos = [];
let contadorPedido = 1;

// ========================================
// 1. POLLING — Consumer busca pedidos novos
// ========================================
app.get('/polling', (req, res) => {
  const pedidosNovos = pedidos
    .filter(p => p.status === 'PLACED')
    .map(p => ({
      id: p.eventId,
      orderId: p.id,
      createdAt: p.criadoEm,
      fullCode: 'PLACED',
      code: 'PLC'
    }));

  res.json({
    items: pedidosNovos,
    statusCode: 0,
    reasonPhrase: null
  });
});

// ========================================
// 2. DETALHES DO PEDIDO — Consumer busca detalhes
// ========================================
app.get('/orders/:orderId', (req, res) => {
  const pedido = pedidos.find(p => p.id === req.params.orderId);

  if (!pedido) {
    return res.status(404).json({ statusCode: 1, reasonPhrase: 'Pedido não encontrado' });
  }

  res.json({
    item: {
      id: pedido.id,
      displayId: pedido.numeroPedido,
      orderType: 'DELIVERY',
      salesChannel: 'PARTNER',
      orderTiming: 'IMMEDIATE',
      createdAt: pedido.criadoEm,
      preparationStartDateTime: pedido.criadoEm,
      merchant: {
        id: 'feijoada-bairrada',
        name: 'Feijoada do Bairrada'
      },
      total: {
        benefits: 0,
        deliveryFee: pedido.taxaEntrega || 0,
        orderAmount: pedido.totalPedido,
        subTotal: pedido.subtotal,
        additionalFees: 0
      },
      payments: {
        methods: [{
          method: 'CASH',
          prepaid: false,
          currency: 'BRL',
          type: 'OFFLINE',
          value: pedido.totalPedido,
          cash: null,
          card: null,
          wallet: null
        }],
        pending: pedido.totalPedido,
        prepaid: 0
      },
      customer: {
        id: pedido.clienteId,
        name: pedido.clienteNome,
        phone: {
          number: pedido.clienteTelefone,
          localizer: '00000000',
          localizerExpiration: new Date(Date.now() + 3600000).toISOString()
        },
        documentNumber: null,
        ordersCountOnMerchant: 0
      },
      items: pedido.itens.map((item, index) => ({
        id: item.id || `item-${index}`,
        externalCode: item.codigoPDV || `PDV${index}`,
        name: item.nome,
        quantity: item.quantidade,
        unitPrice: item.precoUnitario,
        totalPrice: item.precoTotal,
        observations: item.observacao || null,
        imageUrl: item.imagemUrl || null,
        options: item.complementos || null,
        index: index,
        unit: 'UN'
      })),
      delivery: {
        mode: 'DEFAULT',
        deliveredBy: 'MERCHANT',
        pickupCode: pedido.numeroPedido,
        deliveryDateTime: new Date(Date.now() + 3600000).toISOString(),
        deliveryAddress: {
          country: 'BR',
          state: pedido.enderecoEstado || 'SP',
          city: pedido.enderecoCidade || 'São Paulo',
          postalCode: pedido.enderecoCep || '00000000',
          streetName: pedido.enderecoRua || '',
          streetNumber: pedido.enderecoNumero || 'S/N',
          neighborhood: pedido.enderecoBairro || '',
          complement: pedido.enderecoComplemento || null,
          reference: pedido.enderecoReferencia || null
        }
      },
      extraInfo: pedido.observacaoGeral || null
    },
    statusCode: 0,
    reasonPhrase: null
  });
});

// ========================================
// 3. RECEBER DETALHES — Consumer confirma que recebeu
// ========================================
app.post('/orders/:orderId/details', (req, res) => {
  const pedido = pedidos.find(p => p.id === req.params.orderId);
  if (pedido) {
    pedido.statusConsumer = 'DETAILS_SENT';
  }

  res.json({
    statusCode: 0,
    reasonPhrase: `${req.params.orderId} enviado com sucesso.`
  });
});

// ========================================
// 4. ATUALIZAR STATUS — Consumer manda status novo
// ========================================
app.post('/orders/:orderId/status', (req, res) => {
  const { status, justification } = req.body;
  const pedido = pedidos.find(p => p.id === req.params.orderId);

  if (pedido) {
    pedido.statusConsumer = status;
    pedido.justificativa = justification;
  }

  res.json({
    statusCode: 0,
    reasonPhrase: `${req.params.orderId} alterado para '${status}'.`
  });
});

// ========================================
// 5. RECEBER PEDIDO DO BASE44
// ========================================
app.post('/novo-pedido', (req, res) => {
  const dados = req.body;

  const novoPedido = {
    id: `pedido-${Date.now()}`,
    eventId: `evento-${Date.now()}`,
    numeroPedido: String(contadorPedido++).padStart(4, '0'),
    status: 'PLACED',
    statusConsumer: 'AGUARDANDO',
    criadoEm: new Date().toISOString(),
    clienteId: `cliente-${Date.now()}`,
    clienteNome: dados.clienteNome || 'Cliente',
    clienteTelefone: dados.clienteTelefone || '00000000000',
    enderecoRua: dados.enderecoRua || '',
    enderecoNumero: dados.enderecoNumero || '',
    enderecoBairro: dados.enderecoBairro || '',
    enderecoCidade: dados.enderecoCidade || 'São Paulo',
    enderecoEstado: dados.enderecoEstado || 'SP',
    enderecoCep: dados.enderecoCep || '',
    enderecoComplemento: dados.enderecoComplemento || '',
    enderecoReferencia: dados.enderecoReferencia || '',
    itens: dados.itens || [],
    subtotal: dados.subtotal || 0,
    taxaEntrega: dados.taxaEntrega || 0,
    totalPedido: dados.totalPedido || 0,
    observacaoGeral: dados.observacaoGeral || '',
    formaPagamento: dados.formaPagamento || 'Dinheiro'
  };

  pedidos.push(novoPedido);

  console.log(`✅ Novo pedido recebido: #${novoPedido.numeroPedido} - ${novoPedido.clienteNome}`);

  res.json({
    sucesso: true,
    pedidoId: novoPedido.id,
    numeroPedido: novoPedido.numeroPedido,
    mensagem: `Pedido #${novoPedido.numeroPedido} recebido com sucesso!`
  });
});

// ========================================
// 6. LISTAR PEDIDOS (para debug)
// ========================================
app.get('/pedidos', (req, res) => {
  res.json(pedidos);
});

// ========================================
// INICIAR SERVIDOR
// ========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API Consumer rodando na porta ${PORT}`);
});
