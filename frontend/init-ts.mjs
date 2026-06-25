import { mountTownSquare } from '/townsquare.mjs';

// Inicializamos usando o domínio da Vercel para carregar imagens e nuvens.
// O nosso interceptador no HTML vai desviar apenas os comandos para a Oracle.
const target = document.getElementById('townsquare-target');

if (target) {
    mountTownSquare(target, {
        server: window.location.origin, 
        room: 'laricks-biblioteca'
    });
    console.log('🏰 TownSquare inicializado de forma isolada e segura!');
}