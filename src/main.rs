use std::path::PathBuf;
use clap::{Parser, Subcommand};
use anyhow::{Result, Context};
use projectloupe::{BurstDetector, BurstConfig, ImageInfo, QualityAnalyzer};

#[derive(Parser)]
#[command(name = "projectloupe")]
#[command(about = "AI-powered photo culling tool for professional photographers")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Analyze a folder of images and detect burst groups
    Analyze {
        /// Path to folder containing images
        #[arg(short, long)]
        path: PathBuf,
        
        /// Maximum time gap between shots in a burst (milliseconds)
        #[arg(long, default_value = "2000")]
        max_gap_ms: i64,
        
        /// Minimum number of shots to constitute a burst
        #[arg(long, default_value = "3")]
        min_burst_size: usize,
        
        /// Output results to JSON file
        #[arg(short, long)]
        output: Option<PathBuf>,
        
        /// Include quality analysis (slower)
        #[arg(short, long)]
        quality: bool,
    },
    
    /// Test burst detection with sample data
    Test,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    
    match cli.command {
        Commands::Analyze { path, max_gap_ms, min_burst_size, output, quality } => {
            analyze_folder(path, max_gap_ms, min_burst_size, output, quality)
        }
        Commands::Test => run_tests(),
    }
}

fn analyze_folder(
    folder_path: PathBuf,
    max_gap_ms: i64,
    min_burst_size: usize,
    output_path: Option<PathBuf>,
    include_quality: bool,
) -> Result<()> {
    println!("🔍 Analyzing images in: {}", folder_path.display());
    
    // Configure burst detector
    let config = BurstConfig {
        max_gap_ms,
        min_burst_size,
        max_burst_size: 200,
    };
    
    let detector = BurstDetector::new(config);
    let quality_analyzer = if include_quality {
        Some(QualityAnalyzer::new()?)
    } else {
        None
    };
    
    // Scan folder for image files
    let image_extensions = ["jpg", "jpeg", "cr3", "cr2", "nef", "arw", "raf", "dng"];
    let mut image_paths = Vec::new();
    
    if folder_path.is_dir() {
        for entry in std::fs::read_dir(&folder_path)? {
            let entry = entry?;
            let path = entry.path();
            
            if let Some(extension) = path.extension() {
                if let Some(ext_str) = extension.to_str() {
                    if image_extensions.contains(&ext_str.to_lowercase().as_str()) {
                        image_paths.push(path);
                    }
                }
            }
        }
    } else {
        return Err(anyhow::anyhow!("Path is not a directory: {}", folder_path.display()));
    }
    
    if image_paths.is_empty() {
        println!("⚠️  No supported image files found in {}", folder_path.display());
        return Ok(());
    }
    
    image_paths.sort();
    println!("📸 Found {} image files", image_paths.len());
    
    // Extract metadata from all images
    println!("📊 Extracting metadata...");
    let mut images = Vec::new();
    let mut failed_count = 0;
    
    for path in image_paths {
        match ImageInfo::from_file(&path) {
            Ok(mut image_info) => {
                // Add quality analysis if requested
                if let Some(ref analyzer) = quality_analyzer {
                    match analyzer.analyze_image(&path) {
                        Ok(quality_score) => image_info.quality_score = Some(quality_score),
                        Err(e) => println!("⚠️  Quality analysis failed for {}: {}", path.display(), e),
                    }
                }
                images.push(image_info);
            }
            Err(e) => {
                println!("⚠️  Failed to process {}: {}", path.display(), e);
                failed_count += 1;
            }
        }
    }
    
    if failed_count > 0 {
        println!("⚠️  Failed to process {} files", failed_count);
    }
    
    if images.is_empty() {
        println!("❌ No valid images found with readable EXIF data");
        return Ok(());
    }
    
    // Detect burst groups
    println!("🎯 Detecting burst groups...");
    let burst_groups = detector.detect_bursts(images)?;
    
    // Print results
    print_analysis_results(&burst_groups, include_quality);
    
    // Save to JSON if requested
    if let Some(output_path) = output_path {
        let json = serde_json::to_string_pretty(&burst_groups)
            .context("Failed to serialize burst groups to JSON")?;
        
        std::fs::write(&output_path, json)
            .with_context(|| format!("Failed to write output to {}", output_path.display()))?;
        
        println!("💾 Results saved to: {}", output_path.display());
    }
    
    Ok(())
}

fn print_analysis_results(burst_groups: &[projectloupe::BurstGroup], include_quality: bool) {
    println!("\n📈 ANALYSIS RESULTS");
    println!("==================");
    
    let total_images: usize = burst_groups.iter().map(|g| g.images.len()).sum();
    let burst_count = burst_groups.iter().filter(|g| g.images.len() >= 3).count();
    let single_count = burst_groups.len() - burst_count;
    
    println!("Total images: {}", total_images);
    println!("Burst groups: {}", burst_count);
    println!("Single images: {}", single_count);
    
    if burst_count > 0 {
        println!("\n🎯 BURST GROUPS:");
        println!("================");
        
        for (i, group) in burst_groups.iter().enumerate() {
            if group.images.len() < 3 {
                continue; // Skip single images
            }
            
            let stats = group.stats();
            println!("\nBurst {} ({})", i + 1, group.id);
            println!("  📸 Images: {}", stats.image_count);
            println!("  ⏱️  Duration: {:.1}s ({:.1} fps)", stats.duration_ms as f64 / 1000.0, stats.avg_fps);
            println!("  ⚡ Avg gap: {:.0}ms", stats.avg_gap_ms);
            
            if include_quality {
                if let Some(best_pick) = group.best_pick() {
                    if let Some(quality) = &best_pick.quality_score {
                        println!("  ⭐ Best pick: {} (quality: {:.1}% - {})", 
                            best_pick.path.file_name().unwrap().to_str().unwrap(),
                            quality.overall_score * 100.0,
                            quality.quality_category()
                        );
                    }
                }
            }
            
            // Show first few and last few files
            let files_to_show = 3;
            for (j, image) in group.images.iter().take(files_to_show).enumerate() {
                let marker = if include_quality && group.best_pick_index == Some(j) { "⭐" } else { "  " };
                let quality_str = if include_quality {
                    image.quality_score
                        .map(|q| format!(" ({})", q.quality_category()))
                        .unwrap_or_default()
                } else {
                    String::new()
                };
                
                println!("  {} {}{}", marker, 
                    image.path.file_name().unwrap().to_str().unwrap(),
                    quality_str
                );
            }
            
            if group.images.len() > files_to_show * 2 {
                println!("    ... {} more files ...", group.images.len() - files_to_show * 2);
            }
            
            if group.images.len() > files_to_show {
                let skip = (group.images.len() - files_to_show).max(files_to_show);
                for (j, image) in group.images.iter().skip(skip).enumerate() {
                    let actual_index = skip + j;
                    let marker = if include_quality && group.best_pick_index == Some(actual_index) { "⭐" } else { "  " };
                    let quality_str = if include_quality {
                        image.quality_score
                            .map(|q| format!(" ({})", q.quality_category()))
                            .unwrap_or_default()
                    } else {
                        String::new()
                    };
                    
                    println!("  {} {}{}", marker, 
                        image.path.file_name().unwrap().to_str().unwrap(),
                        quality_str
                    );
                }
            }
        }
    }
}

fn run_tests() -> Result<()> {
    println!("🧪 Running ProjectLoupe burst detection tests...");
    
    // This would run the built-in tests
    println!("✅ All tests would run here (use 'cargo test' for actual unit tests)");
    println!("🎯 Burst detection algorithm ready for real-world testing!");
    
    // Show example usage
    println!("\n📖 EXAMPLE USAGE:");
    println!("================");
    println!("1. Basic analysis:");
    println!("   projectloupe analyze --path /path/to/photos");
    println!("");
    println!("2. With quality analysis:");
    println!("   projectloupe analyze --path /path/to/photos --quality");
    println!("");
    println!("3. Custom burst settings:");
    println!("   projectloupe analyze --path /path/to/photos --max-gap-ms 1000 --min-burst-size 5");
    println!("");
    println!("4. Save results to JSON:");
    println!("   projectloupe analyze --path /path/to/photos --output results.json");
    
    Ok(())
}
