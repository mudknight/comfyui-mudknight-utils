---
title: "Utilities"
weight: 4
---

### OpenCV Denoise
Based on the opencv script [here](https://rentry.org/RemovingDiffusionGunk). It removes noise left behind by the diffusion process.

ComfyUI seems to limit nodes to a single core, so using the CPU for this node is excruciatingly slow. 

{{< details title="GPU selection on multi-GPU systems" >}}
If you want to use a specific gpu on a multi-gpu system, use `clinfo -l` to get a list of devices and set the environment variable `OPENCV_OPENCL_DEVICE` to `<platform>:GPU:<index>`, where `<platform>` is everything listed after `Platform #*:` and `<index>` is the `Device #`. For example:

```
Platform #0: Intel(R) OpenCL Graphics
 `-- Device #0: Intel(R) Arc(TM) B580 Graphics
Platform #1: rusticl
 `-- Device #0: AMD Radeon RX 6800 (radeonsi, navi21, LLVM 21.1.6, DRM 3.64, 6.18.2-arch2-1)
```

Here you would use `OPENCV_OPENCL_DEVICE=Intel(R) OpenCL Graphics:GPU:0` or `OPENCV_OPENCL_DEVICE=rusticl:GPU:0`
{{< /details >}}

### Auto-level
Adjusts black and white levels to the closest values within a threshold.
