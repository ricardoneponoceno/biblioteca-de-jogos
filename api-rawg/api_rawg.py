import os
from flask import Flask, jsonify
from flask_cors import CORS
import requests

# --- CONFIGURAÇÃO ---
RAWG_API_KEY = os.environ.get('RAWG_API_KEY')
RAWG_BASE = "https://api.rawg.io/api/games"
MAX_RESULTS = 15

app = Flask(__name__)

# --- Configuração de CORS Dinâmica ---
origins = os.environ.get('CORS_ORIGIN', '').split(',')
if not origins or origins == ['']:
    print("AVISO: A variável de ambiente CORS_ORIGIN não está definida. CORS não estará ativo.")
CORS(app, resources={r"/*": {"origins": origins}})


def key_missing():
    return not RAWG_API_KEY or RAWG_API_KEY == "SUA_CHAVE_DE_API_AQUI"


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
        }, timeout=10)
        resp.raise_for_status()
        results = resp.json().get("results", [])
        results.sort(key=lambda g: g.get("added") or 0, reverse=True)
        return jsonify({"results": [serialize(g) for g in results]})
    except requests.exceptions.RequestException as e:
        return jsonify({"error": "Erro ao contatar a API da RAWG.", "details": str(e)}), 500


@app.route('/rawg/game/<id_or_slug>', methods=['GET'])
def game_by_id(id_or_slug):
    """Busca exata por id numérico ou slug — usado pelo escape hatch de colar link.

    A RAWG aceita id ou slug no mesmo endpoint (ex: /games/god-of-war-2).
    """
    if key_missing():
        return jsonify({"error": "A chave da API da RAWG não foi configurada no servidor."}), 500
    try:
        resp = requests.get(f"{RAWG_BASE}/{id_or_slug}", params={"key": RAWG_API_KEY}, timeout=10)
        if resp.status_code == 404:
            return jsonify({"error": f"Jogo '{id_or_slug}' não encontrado."}), 404
        resp.raise_for_status()
        return jsonify(serialize(resp.json()))
    except requests.exceptions.RequestException as e:
        return jsonify({"error": "Erro ao contatar a API da RAWG.", "details": str(e)}), 500


# Este bloco só é executado se você rodar "python api_rawg.py" diretamente
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3003, debug=True)
