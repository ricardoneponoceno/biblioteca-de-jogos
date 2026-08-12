import os
from flask import Flask, jsonify
from flask_cors import CORS
import requests

# --- CONFIGURAÇÃO ---
RAWG_API_KEY = os.environ.get('RAWG_API_KEY')
RAWG_BASE = "https://api.rawg.io/api/games"
MAX_RESULTS = 15
UPSTREAM_TIMEOUT = 10   # segundos que esperamos a RAWG antes de desistir

app = Flask(__name__)

# --- Configuração de CORS Dinâmica ---
origins = os.environ.get('CORS_ORIGIN', '').split(',')
if not origins or origins == ['']:
    print("AVISO: A variável de ambiente CORS_ORIGIN não está definida. CORS não estará ativo.")
CORS(app, resources={r"/*": {"origins": origins}})


def key_missing():
    return not RAWG_API_KEY or RAWG_API_KEY == "SUA_CHAVE_DE_API_AQUI"


def sem_chave(texto):
    """Remove a chave da API de um texto antes de ele ir para qualquer lugar.

    Vale inclusive para o log: `docker logs` acaba em print de tela, em anexo de
    chamado e colado em conversa. Chave não deve estar escrita em lugar nenhum
    além da variável de ambiente.
    """
    return texto.replace(RAWG_API_KEY, "***") if RAWG_API_KEY else texto


def falha_upstream(e):
    """Traduz uma falha de saída num status HTTP honesto, sem vazar detalhe interno.

    Nunca devolver `str(e)` ao cliente: a mensagem do `requests` inclui a URL
    chamada, e a URL leva a chave no query string. Um 401 ou 429 da RAWG viraria
    uma resposta pública com a chave dentro — justamente o que este proxy existe
    para evitar.

    Os três status separam de quem é o problema, para o cliente não confundir
    "a RAWG caiu" com "o proxy está com bug".
    """
    app.logger.warning("Falha ao contatar a RAWG: %s", sem_chave(str(e)))
    # ConnectionError vem antes de Timeout de propósito: ConnectTimeout herda dos
    # dois, e não ter conseguido nem conectar é "indisponível", não "demorou".
    if isinstance(e, requests.exceptions.ConnectionError):
        return jsonify({"error": "Não foi possível alcançar a RAWG. O serviço pode estar fora do ar."}), 503
    if isinstance(e, requests.exceptions.Timeout):
        return jsonify({"error": "A RAWG demorou demais para responder."}), 504
    return jsonify({"error": "A RAWG respondeu com erro."}), 502


def year_of(released):
    return int(released[:4]) if released else None


def serialize(game):
    """Converte um jogo da RAWG no formato que o app consome."""
    return {
        "rawg_id": game.get("id"),
        "slug": game.get("slug"),
        "name": game.get("name"),
        "year": year_of(game.get("released")),   # pra desambiguação (ex: 2005 vs 2018)
        "released": game.get("released"),
        "metacritic": game.get("metacritic"),
        "image_url": game.get("background_image"),
        "added": game.get("added"),              # popularidade (nº de coleções)
    }


@app.route('/rawg/search/<query>', methods=['GET'])
def search_games(query):
    """Busca por título e devolve vários candidatos, pra desambiguação no cliente.

    Ordena por `added` (popularidade) porque a RAWG não é perfeitamente
    deduplicada: entradas duplicadas de baixa qualidade (quase sem uso) não
    devem competir de igual pra igual com as reais.
    """
    if key_missing():
        return jsonify({"error": "A chave da API da RAWG não foi configurada no servidor."}), 500
    try:
        resp = requests.get(RAWG_BASE, params={
            "key": RAWG_API_KEY,
            "search": query,
            "page_size": MAX_RESULTS,
        }, timeout=UPSTREAM_TIMEOUT)
        resp.raise_for_status()
        results = resp.json().get("results", [])
        results.sort(key=lambda g: g.get("added") or 0, reverse=True)
        return jsonify({"results": [serialize(g) for g in results]})
    except requests.exceptions.RequestException as e:
        return falha_upstream(e)


@app.route('/rawg/game/<id_or_slug>', methods=['GET'])
def game_by_id(id_or_slug):
    """Busca exata por id numérico ou slug — usado pelo escape hatch de colar link.

    A RAWG aceita id ou slug no mesmo endpoint (ex: /games/god-of-war-2).
    """
    if key_missing():
        return jsonify({"error": "A chave da API da RAWG não foi configurada no servidor."}), 500
    try:
        resp = requests.get(f"{RAWG_BASE}/{id_or_slug}", params={"key": RAWG_API_KEY},
                            timeout=UPSTREAM_TIMEOUT)
        if resp.status_code == 404:
            return jsonify({"error": f"Jogo '{id_or_slug}' não encontrado."}), 404
        resp.raise_for_status()
        return jsonify(serialize(resp.json()))
    except requests.exceptions.RequestException as e:
        return falha_upstream(e)


# Este bloco só é executado se você rodar "python api_rawg.py" diretamente
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3003, debug=True)
