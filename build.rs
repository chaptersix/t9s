use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let proto_root = PathBuf::from("proto/temporal-api");
    let service_proto = proto_root.join("temporal/api/workflowservice/v1/service.proto");

    if service_proto.exists() {
        println!("cargo:rerun-if-changed=proto/temporal-api");

        let out_dir = PathBuf::from("src/proto/generated");
        std::fs::create_dir_all(&out_dir)?;

        tonic_build::configure()
            .build_server(false)
            .out_dir(&out_dir)
            .compile_protos(&[service_proto], &[proto_root.as_path()])?;
    }

    Ok(())
}
