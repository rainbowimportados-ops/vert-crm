// Uma única camada para tudo que abre flutuando: lista suspensa, menu e popover.
//
// O problema que isto resolve: as camadas do sistema foram crescendo soltas, uma
// tela de cada vez, e hoje convivem 51 (painel lateral), 100 (diálogo
// minimizado, aviso de atualização, toast), 110 (menu lateral no celular),
// 120 (diálogos do CRM), 200 (barra de janelas minimizadas) e 210 (barra do topo
// e faixa de área segura). Os painéis do Radix ficaram todos em z-50, abaixo de
// todas elas. Resultado prático: abrir uma lista dentro do CRM, do painel
// lateral ou perto do topo da tela mostrava a lista atrás da superfície.
//
// Painel flutuante é sempre a última coisa que o usuário abriu, então precisa
// ficar acima de qualquer superfície de onde possa ser aberto. Daí 300: uma
// faixa acima do teto atual (210), com folga para o sistema crescer sem que
// alguém precise lembrar deste arquivo.
//
// Quem for criar uma superfície nova: use um valor abaixo de 300, ou venha aqui
// e suba os dois juntos — de propósito, não por acidente.
export const CAMADA_FLUTUANTE = "z-[300]";
