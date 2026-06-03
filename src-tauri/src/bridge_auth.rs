use actix_web::{
    body::BoxBody,
    dev::{forward_ready, ServiceRequest, ServiceResponse, Service, Transform},
    http::header,
    Error, HttpResponse,
};
use futures_util::future::LocalBoxFuture;
use std::future::{ready, Ready};
use subtle::ConstantTimeEq;

#[derive(Clone)]
pub struct BridgeAuthConfig {
    pub token: Option<String>,
}

pub struct Auth;

impl<S> Transform<S, ServiceRequest> for Auth
where
    S: Service<ServiceRequest, Response = ServiceResponse<BoxBody>, Error = Error> + 'static,
    S::Future: 'static,
{
    type Response = ServiceResponse<BoxBody>;
    type Error = Error;
    type Transform = AuthMiddleware<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(AuthMiddleware { service }))
    }
}

pub struct AuthMiddleware<S> {
    service: S,
}

impl<S> Service<ServiceRequest> for AuthMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<BoxBody>, Error = Error> + 'static,
    S::Future: 'static,
{
    type Response = ServiceResponse<BoxBody>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let auth_config = req
            .app_data::<actix_web::web::Data<BridgeAuthConfig>>()
            .and_then(|d| d.token.clone());

        let auth_header = req
            .headers()
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok().map(|s| s.to_owned()))
            .or_else(|| {
                req.headers()
                    .get("x-openclicky-token")
                    .and_then(|v| v.to_str().ok().map(|s| s.to_owned()))
            });

        let (http_req, payload) = req.into_parts();

        let should_block = if let Some(expected_token) = auth_config {
            let token_ok = match auth_header {
                Some(h) => {
                    let provided = h.strip_prefix("Bearer ").unwrap_or(&h);
                    expected_token.as_bytes().ct_eq(provided.as_bytes()).unwrap_u8() == 1
                }
                None => false,
            };
            !token_ok
        } else {
            false
        };

        if should_block {
            let response = HttpResponse::Unauthorized().json(serde_json::json!({
                "error": "unauthorized",
                "message": "Invalid or missing authentication token"
            }));
            return Box::pin(async move { Ok(ServiceResponse::new(http_req, response)) });
        }

        let req = ServiceRequest::new(http_req, payload);
        let fut = self.service.call(req);
        Box::pin(async move { fut.await })
    }
}
