def test_response_includes_request_id(client):
    response = client.get("/api/album")

    assert response.status_code == 200
    assert response.headers["x-request-id"]
